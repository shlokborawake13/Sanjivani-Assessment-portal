import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)

// GET /api/results — Get results (own for student, all for admin/manager)
router.get('/', async (req, res) => {
  try {
    const role = req.user.profile.role
    let query = supabaseAdmin
      .from('results')
      .select('*, profiles(name, email, prn, department)')
      .order('completed_at', { ascending: false })

    // Students only see their own results
    if (role === 'student') {
      query = query.eq('user_id', req.user.id)
    }

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })
    res.json({ results: data })
  } catch (err) {
    console.error('Get results error:', err)
    res.status(500).json({ error: 'Failed to fetch results' })
  }
})

// GET /api/results/stats — Get aggregated stats
router.get('/stats', async (req, res) => {
  try {
    const role = req.user.profile.role
    let query = supabaseAdmin.from('results').select('*')
    
    if (role === 'student') {
      query = query.eq('user_id', req.user.id)
    }

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })

    const totalAttempts = data.length
    const avgScore = totalAttempts > 0
      ? Math.round(data.reduce((sum, r) => sum + r.percentage, 0) / totalAttempts)
      : 0
    const bestScore = totalAttempts > 0
      ? Math.max(...data.map(r => r.percentage))
      : 0
    const passed = data.filter(r => r.status === 'passed').length
    const failed = data.filter(r => r.status === 'failed').length

    // Category breakdown
    const categories = {}
    data.forEach(r => {
      if (!categories[r.category]) {
        categories[r.category] = { total: 0, sum: 0, count: 0 }
      }
      categories[r.category].sum += r.percentage
      categories[r.category].count += 1
    })

    const categoryBreakdown = Object.entries(categories).map(([category, vals]) => ({
      category,
      average: Math.round(vals.sum / vals.count),
      attempts: vals.count
    }))

    // Monthly performance data
    const monthlyMap = {}
    data.forEach(r => {
      const date = new Date(r.completed_at)
      const monthKey = date.toLocaleString('en-US', { month: 'short', year: '2-digit' })
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {}
      }
      const cat = r.category.toLowerCase()
      if (!monthlyMap[monthKey][cat]) {
        monthlyMap[monthKey][cat] = { sum: 0, count: 0 }
      }
      monthlyMap[monthKey][cat].sum += r.percentage
      monthlyMap[monthKey][cat].count += 1
    })

    const performanceData = Object.entries(monthlyMap).map(([month, cats]) => {
      const entry = { month }
      Object.entries(cats).forEach(([cat, vals]) => {
        entry[cat] = Math.round(vals.sum / vals.count)
      })
      return entry
    })

    res.json({
      stats: {
        totalAttempts,
        avgScore,
        bestScore,
        passed,
        failed,
        categoryBreakdown,
        performanceData
      }
    })
  } catch (err) {
    console.error('Get stats error:', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// POST /api/results — Submit a result
router.post('/', async (req, res) => {
  try {
    const { assessment_id, assessment_title, category, score, total, duration } = req.body

    if (!assessment_title || !category || score === undefined || !total) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const percentage = Math.round((score / total) * 100)
    const status = percentage >= 50 ? 'passed' : 'failed'

    const { data, error } = await supabaseAdmin
      .from('results')
      .insert({
        user_id: req.user.id,
        assessment_id: assessment_id || null,
        assessment_title,
        category,
        score,
        total,
        percentage,
        duration: duration || '',
        status
      })
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(500).json({ error: 'Failed to create result' })
    res.status(201).json({ result: data })
  } catch (err) {
    console.error('Submit result error:', err)
    res.status(500).json({ error: 'Failed to submit result' })
  }
})

export default router
