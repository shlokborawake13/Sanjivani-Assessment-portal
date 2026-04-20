import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)

// POST /api/attempts — Start a new attempt
router.post('/', async (req, res) => {
  try {
    const { assessment_id } = req.body
    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' })

    // Check if assessment exists and is available
    const { data: assessment, error: aErr } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .maybeSingle()

    if (aErr || !assessment) return res.status(404).json({ error: 'Assessment not found' })
    if (assessment.status !== 'available') return res.status(400).json({ error: 'Assessment is not available' })

    // Check if user already has an in-progress attempt
    const { data: existing } = await supabaseAdmin
      .from('attempts')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (existing) {
      return res.json({ attempt: existing, resumed: true })
    }

    // Get question count
    const { count } = await supabaseAdmin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessment_id)

    // Create new attempt
    const { data: attempt, error } = await supabaseAdmin
      .from('attempts')
      .insert({
        user_id: req.user.id,
        assessment_id,
        total: count || assessment.questions || 0,
        strict_mode_enabled: true,
        status: 'in_progress'
      })
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!attempt) return res.status(500).json({ error: 'Failed to create attempt' })
    res.status(201).json({ attempt, resumed: false })
  } catch (err) {
    console.error('Start attempt error:', err)
    res.status(500).json({ error: 'Failed to start attempt' })
  }
})

// PUT /api/attempts/:id/submit — Submit an attempt (manual or auto)
router.put('/:id/submit', async (req, res) => {
  try {
    const { answers, submission_reason } = req.body

    // Fetch the attempt
    const { data: attempt, error: fetchErr } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(id, title, category)')
      .eq('id', req.params.id)
      .maybeSingle()

    if (fetchErr || !attempt) return res.status(404).json({ error: 'Attempt not found' })

    // Verify ownership (unless admin)
    if (attempt.user_id !== req.user.id && req.user.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Prevent double submission
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'Attempt already submitted' })
    }

    // Fetch correct answers
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, correct_answer')
      .eq('assessment_id', attempt.assessment_id)
      .order('sort_order')

    // Grade the answers
    const submittedAnswers = answers || attempt.answers || []
    let score = 0
    const total = questions?.length || attempt.total || 0

    if (questions && submittedAnswers.length > 0) {
      questions.forEach((q, idx) => {
        const studentAnswer = submittedAnswers[idx]
        if (studentAnswer && studentAnswer.selected === q.correct_answer) {
          score++
        }
      })
    }

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0
    const isAutoSubmit = !!submission_reason
    const status = isAutoSubmit ? 'auto_submitted' : 'submitted'

    // Get violation count
    const { count: violationCount } = await supabaseAdmin
      .from('violations')
      .select('id', { count: 'exact', head: true })
      .eq('attempt_id', req.params.id)

    // Update attempt
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        answers: submittedAnswers,
        score,
        total,
        percentage,
        status,
        submission_reason: submission_reason || 'Manual submission',
        violation_count: violationCount || 0,
        submitted_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle()

    if (updateErr) return res.status(400).json({ error: updateErr.message })

    // Also save to results table for dashboard stats
    const resultStatus = percentage >= 50 ? 'passed' : 'failed'
    const resultCategory = attempt.assessments?.category || 'General'
    await supabaseAdmin.from('results').insert({
      user_id: attempt.user_id,
      assessment_id: attempt.assessment_id,
      assessment_title: attempt.assessments?.title || 'Unknown',
      category: resultCategory,
      score,
      total,
      percentage,
      status: resultStatus,
      duration: ''
    }).catch(() => {}) // non-fatal

    // Update profile scores for leaderboard
    try {
      // Fetch all results for this user in this category to recalculate avg
      const { data: catResults } = await supabaseAdmin
        .from('results')
        .select('percentage')
        .eq('user_id', attempt.user_id)
        .eq('category', resultCategory)

      const catAvg = catResults && catResults.length > 0
        ? Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length)
        : percentage

      const scoreColumn = resultCategory.toLowerCase() === 'aptitude' ? 'aptitude_score'
        : resultCategory.toLowerCase() === 'coding' ? 'coding_score'
        : resultCategory.toLowerCase() === 'communication' ? 'communication_score'
        : null

      const updateObj = { total_problems_solved: (catResults?.length || 0) }
      if (scoreColumn) updateObj[scoreColumn] = catAvg

      // Get total solved across all categories
      const { count: totalSolved } = await supabaseAdmin
        .from('results')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', attempt.user_id)

      updateObj.total_problems_solved = totalSolved || 0

      // Also update streak on assessment submission
      const today = new Date().toISOString().split('T')[0]
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('current_streak, max_streak, last_active_date')
        .eq('id', attempt.user_id)
        .maybeSingle()

      if (prof) {
        const lastActive = prof.last_active_date
        let newStreak = prof.current_streak || 0

        if (lastActive) {
          const lastDate = new Date(lastActive + 'T00:00:00Z')
          const todayDate = new Date(today + 'T00:00:00Z')
          const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24))

          if (diffDays === 1) newStreak = newStreak + 1
          else if (diffDays > 1) newStreak = 1
          // diffDays === 0 → already active today, keep streak
        } else {
          newStreak = 1
        }

        const newMax = Math.max(newStreak, prof.max_streak || 0)
        updateObj.current_streak = newStreak
        updateObj.max_streak = newMax
        updateObj.last_active_date = today
      }

      await supabaseAdmin
        .from('profiles')
        .update(updateObj)
        .eq('id', attempt.user_id)
    } catch (profileErr) {
      console.error('Profile score update error (non-fatal):', profileErr.message)
    }

    res.json({ attempt: updated, score, total, percentage, status: resultStatus })
  } catch (err) {
    console.error('Submit attempt error:', err)
    res.status(500).json({ error: 'Failed to submit attempt' })
  }
})

// POST /api/attempts/:id/violation — Log a violation
router.post('/:id/violation', async (req, res) => {
  try {
    const { type, details } = req.body
    if (!type) return res.status(400).json({ error: 'Violation type is required' })

    // Verify attempt belongs to user
    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, status, warnings_log, violation_count')
      .eq('id', req.params.id)
      .maybeSingle()

    if (!attempt) return res.status(404).json({ error: 'Attempt not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Attempt already submitted' })

    // Insert violation record
    const { error: vErr } = await supabaseAdmin
      .from('violations')
      .insert({
        attempt_id: req.params.id,
        type,
        details: details || ''
      })

    if (vErr) return res.status(400).json({ error: vErr.message })

    // Update attempt warnings log
    const warningsLog = attempt.warnings_log || []
    warningsLog.push({ type, details, timestamp: new Date().toISOString() })

    await supabaseAdmin
      .from('attempts')
      .update({
        warnings_log: warningsLog,
        violation_count: (attempt.violation_count || 0) + 1
      })
      .eq('id', req.params.id)

    res.json({ logged: true, violation_count: (attempt.violation_count || 0) + 1 })
  } catch (err) {
    console.error('Log violation error:', err)
    res.status(500).json({ error: 'Failed to log violation' })
  }
})

// PUT /api/attempts/:id/answers — Save answers in progress (auto-save)
router.put('/:id/answers', async (req, res) => {
  try {
    const { answers } = req.body

    const { error } = await supabaseAdmin
      .from('attempts')
      .update({ answers })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('status', 'in_progress')

    if (error) return res.status(400).json({ error: error.message })
    res.json({ saved: true })
  } catch (err) {
    console.error('Save answers error:', err)
    res.status(500).json({ error: 'Failed to save answers' })
  }
})

// GET /api/attempts — Get attempts (own for students, all for admin/manager)
router.get('/', async (req, res) => {
  try {
    const role = req.user.profile.role
    let query = supabaseAdmin
      .from('attempts')
      .select('*, assessments(title, category), profiles(name, email, prn, department)')
      .order('created_at', { ascending: false })

    if (role === 'student') {
      query = query.eq('user_id', req.user.id)
    }

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })
    res.json({ attempts: data })
  } catch (err) {
    console.error('Get attempts error:', err)
    res.status(500).json({ error: 'Failed to fetch attempts' })
  }
})

// GET /api/attempts/:id — Get attempt details with violations
router.get('/:id', async (req, res) => {
  try {
    const { data: attempt, error } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(title, category, duration), violations(*)')
      .eq('id', req.params.id)
      .maybeSingle()

    if (error || !attempt) return res.status(404).json({ error: 'Attempt not found' })

    // Verify ownership (unless admin/manager)
    const role = req.user.profile.role
    if (attempt.user_id !== req.user.id && !['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    res.json({ attempt })
  } catch (err) {
    console.error('Get attempt detail error:', err)
    res.status(500).json({ error: 'Failed to fetch attempt' })
  }
})

export default router
