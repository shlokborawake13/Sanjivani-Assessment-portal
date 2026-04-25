import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ─── POST /api/leaderboard/checkin — Record daily visit & update streak ───
router.post('/checkin', async (req, res) => {
  try {
    const userId = req.user.id
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // Fetch current profile streak data
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_streak, max_streak, last_active_date')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) return res.json({ streak: 0, max_streak: 0 })

    const lastActive = profile.last_active_date
    let newStreak = profile.current_streak || 0
    let newMax = profile.max_streak || 0

    if (lastActive) {
      const lastDate = new Date(lastActive + 'T00:00:00Z')
      const todayDate = new Date(today + 'T00:00:00Z')
      const diffMs = todayDate.getTime() - lastDate.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        // Already checked in today — return current values
        return res.json({ streak: newStreak, max_streak: newMax })
      } else if (diffDays === 1) {
        // Consecutive day — increment streak
        newStreak = newStreak + 1
      } else {
        // Missed a day — reset streak to 1
        newStreak = 1
      }
    } else {
      // First ever check-in
      newStreak = 1
    }

    newMax = Math.max(newStreak, newMax)

    // Update profile with new streak
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        current_streak: newStreak,
        max_streak: newMax,
        last_active_date: today
      })
      .eq('id', userId)

    if (updateErr) {
      console.error('Streak update error:', updateErr.message)
    }

    // Try to record daily visit (non-fatal if RLS blocks it)
    try {
      await supabaseAdmin
        .from('daily_visits')
        .upsert({ user_id: userId, visit_date: today }, { onConflict: 'user_id,visit_date' })
    } catch {
      // RLS may block — not a problem since streaks are tracked in profiles
    }

    res.json({ streak: newStreak, max_streak: newMax })
  } catch (err) {
    console.error('Checkin error:', err)
    res.status(500).json({ error: 'Failed to record checkin' })
  }
})

// ─── GET /api/leaderboard — Full leaderboard (aggregated from results + streaks) ───
router.get('/', async (req, res) => {
  try {
    const { category, department, limit: limitParam } = req.query
    const pageLimit = Math.min(parseInt(limitParam) || 50, 100)

    // 1. Fetch all results joined with profiles AND all student profiles (for streak-only students)
    // Note: Results from invalidated attempts are still in results table
    // To exclude them, we'd need to cross-reference attempts.invalidated
    // For now, we fetch attempts to get invalidation status
    const [resultsQuery, allStudentsQuery, invalidatedQuery] = await Promise.all([
      supabaseAdmin
        .from('results')
        .select('id, user_id, percentage, score, total, category, completed_at, status, profiles(*)'),
      supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('role', 'student'),
      supabaseAdmin
        .from('attempts')
        .select('id, user_id, assessment_id, invalidated')
        .eq('invalidated', true)
    ])

    if (resultsQuery.error) {
      console.error('Leaderboard results query error:', resultsQuery.error)
      return res.status(400).json({ error: resultsQuery.error.message })
    }

    const results = resultsQuery.data || []
    const allStudents = allStudentsQuery.data || []

    // 2. Build a map of ALL students (ensures streak-only students appear too)
    const userMap = {}
    allStudents.forEach(p => {
      userMap[p.id] = {
        id: p.id,
        name: p.name,
        prn: p.prn,
        department: p.department,
        profile_url: p.profile_url || p.avatar_url || null,
        streak: p.current_streak || 0,
        max_streak: p.max_streak || 0,
        scores: [],
        aptitude_scores: [],
        coding_scores: [],
        communication_scores: [],
        last_activity: p.last_active_date || null,
      }
    })

    // 3. Aggregate scores per user from results
    results.forEach(r => {
      const p = r.profiles
      if (!p || p.role !== 'student') return

      // Ensure user exists in map (fallback for edge cases)
      if (!userMap[r.user_id]) {
        userMap[r.user_id] = {
          id: p.id,
          name: p.name,
          prn: p.prn,
          department: p.department,
          profile_url: p.profile_url || p.avatar_url || null,
          streak: p.current_streak || 0,
          max_streak: p.max_streak || 0,
          scores: [],
          aptitude_scores: [],
          coding_scores: [],
          communication_scores: [],
          last_activity: null,
        }
      }

      const u = userMap[r.user_id]
      const pct = r.percentage || 0
      u.scores.push(pct)

      // Track last activity
      if (r.completed_at && (!u.last_activity || r.completed_at > u.last_activity)) {
        u.last_activity = r.completed_at
      }

      // Category breakdown
      const cat = (r.category || '').toLowerCase().trim()
      if (cat.includes('aptitude')) u.aptitude_scores.push(pct)
      else if (cat.includes('coding')) u.coding_scores.push(pct)
      else if (cat.includes('communication')) u.communication_scores.push(pct)
    })

    // 4. Build leaderboard entries
    const calcAvg = arr => arr.length > 0
      ? parseFloat((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2))
      : 0
    const calcMax = arr => arr.length > 0 ? Math.max(...arr) : 0

    let leaderboard = Object.values(userMap)
      .map(u => {
        const total_attempts = u.scores.length
        const avg_percentage = calcAvg(u.scores)
        const highest_score = calcMax(u.scores)
        const aptitude_score = Math.round(calcAvg(u.aptitude_scores))
        const coding_score = Math.round(calcAvg(u.coding_scores))
        const communication_score = Math.round(calcAvg(u.communication_scores))

        // Overall score = weighted formula
        // 70% avg + 20% highest + 10% attempt bonus (log scale)
        const overall_score = Math.round(
          avg_percentage * 0.7 +
          highest_score * 0.2 +
          Math.log(total_attempts + 1) * 10
        )

        return {
          id: u.id,
          name: u.name,
          prn: u.prn,
          department: u.department,
          profile_url: u.profile_url,
          streak: u.streak,
          max_streak: u.max_streak,
          problems_solved: total_attempts,
          total_attempts,
          avg_percentage,
          highest_score,
          aptitude_score,
          coding_score,
          communication_score,
          overall_score,
          last_activity: u.last_activity,
        }
      })

    // 5. Filter by department
    if (department && department !== 'All') {
      leaderboard = leaderboard.filter(e => e.department === department)
    }

    // 6. Sort — primary sort by streak (highest first), then by score
    const sortDesc = (a, b, key) => (b[key] || 0) - (a[key] || 0)
    const sortByActivity = (a, b) => (b.last_activity || '').localeCompare(a.last_activity || '')

    if (category === 'aptitude') {
      leaderboard.sort((a, b) => sortDesc(a, b, 'aptitude_score') || sortDesc(a, b, 'total_attempts') || sortByActivity(a, b))
      // Only show students with attempts for score-based categories
      leaderboard = leaderboard.filter(e => e.total_attempts > 0)
    } else if (category === 'coding') {
      leaderboard.sort((a, b) => sortDesc(a, b, 'coding_score') || sortDesc(a, b, 'total_attempts') || sortByActivity(a, b))
      leaderboard = leaderboard.filter(e => e.total_attempts > 0)
    } else if (category === 'communication') {
      leaderboard.sort((a, b) => sortDesc(a, b, 'communication_score') || sortDesc(a, b, 'total_attempts') || sortByActivity(a, b))
      leaderboard = leaderboard.filter(e => e.total_attempts > 0)
    } else if (category === 'streak') {
      // Streak category: sort by current streak DESC, then overall_score DESC, then last_active_date DESC
      leaderboard = leaderboard.filter(e => e.streak > 0 || e.max_streak > 0)
      leaderboard.sort((a, b) => sortDesc(a, b, 'streak') || sortDesc(a, b, 'overall_score') || sortByActivity(a, b))
    } else {
      // Default: sort by streak first, then overall_score, then last_activity
      leaderboard.sort((a, b) => sortDesc(a, b, 'streak') || sortDesc(a, b, 'overall_score') || sortByActivity(a, b))
      // Only show students with at least some activity (streak OR attempts)
      leaderboard = leaderboard.filter(e => e.streak > 0 || e.total_attempts > 0)
    }

    // 7. Assign ranks (1-indexed)
    const fullRanked = leaderboard.map((entry, idx) => ({ ...entry, rank: idx + 1 }))
    const sliced = fullRanked.slice(0, pageLimit)

    // 8. Unique departments for filter
    const departments = [...new Set(
      Object.values(userMap).map(u => u.department).filter(Boolean)
    )]

    // 9. Current user's rank (even if not in top N)
    const userEntry = fullRanked.find(e => e.id === req.user.id) || null

    res.json({ leaderboard: sliced, departments, userEntry })
  } catch (err) {
    console.error('Leaderboard error:', err)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

// ─── GET /api/leaderboard/stats — Engagement stats for admin/manager ───
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Active today — users whose last_active_date is today
    const { count: activeToday } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('last_active_date', today)
      .eq('role', 'student')

    // Active this week — users whose last_active_date >= 7 days ago
    const { count: activeWeekly } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('last_active_date', sevenDaysAgo)
      .eq('role', 'student')

    // Daily breakdown — try daily_visits table, fall back gracefully
    let dailyBreakdown = []
    try {
      const { data: weeklyVisits } = await supabaseAdmin
        .from('daily_visits')
        .select('user_id, visit_date')
        .gte('visit_date', sevenDaysAgo)

      const dailyMap = {}
      ;(weeklyVisits || []).forEach(v => {
        dailyMap[v.visit_date] = (dailyMap[v.visit_date] || 0) + 1
      })
      dailyBreakdown = Object.entries(dailyMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))
    } catch {
      // daily_visits may have RLS issues, non-fatal
    }

    // Top streakers — from profiles (always works)
    const { data: topStreakers } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .gt('current_streak', 0)
      .order('current_streak', { ascending: false })
      .limit(5)

    res.json({
      activeToday: activeToday || 0,
      activeWeekly: activeWeekly || 0,
      dailyBreakdown,
      topStreakers: (topStreakers || []).map(s => ({
        name: s.name,
        department: s.department,
        current_streak: s.current_streak,
        profile_url: s.profile_url || s.avatar_url || null,
      }))
    })
  } catch (err) {
    console.error('Leaderboard stats error:', err)
    res.status(500).json({ error: 'Failed to fetch engagement stats' })
  }
})

export default router
