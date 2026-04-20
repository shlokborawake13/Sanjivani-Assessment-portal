import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)
router.use(roleGuard('manager', 'admin'))  // Allow both managers and admins

// Helper: safely fetch auth users with retry, returns empty map on failure
async function getAuthUsersMap(retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const authRes = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const authUsers = authRes.data?.users || []
      return Object.fromEntries(authUsers.map(u => [u.id, u]))
    } catch (err) {
      console.error(`Failed to fetch auth users (attempt ${attempt + 1}/${retries + 1}):`, err.message)
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  return {}
}

// GET /api/manager/students — List all students with auth metadata
router.get('/students', async (req, res) => {
  try {
    // Fetch student profiles first (critical)
    const profilesRes = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false })

    if (profilesRes.error) {
      return res.status(400).json({ error: profilesRes.error.message })
    }

    // Fetch auth metadata separately — non-fatal if it fails
    const authMap = await getAuthUsersMap()

    const students = (profilesRes.data || []).map(p => {
      const authUser = authMap[p.id]
      return {
        ...p,
        last_sign_in: authUser?.last_sign_in_at || null,
        confirmed: !!authUser?.email_confirmed_at
      }
    })

    res.json({ students })
  } catch (err) {
    console.error('List students error:', err)
    res.status(500).json({ error: 'Failed to fetch students' })
  }
})

// GET /api/manager/stats — Dashboard stats for manager
router.get('/stats', async (req, res) => {
  try {
    const [studentsRes, assessmentsRes, resultsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('role', 'student'),
      supabaseAdmin.from('assessments').select('id, category, status'),
      supabaseAdmin.from('results').select('*, profiles(name, department)')
    ])

    const students = studentsRes.data || []
    const assessments = assessmentsRes.data || []
    const results = resultsRes.data || []

    // Department stats
    const departmentMap = {}
    students.forEach(s => {
      const dept = s.department || 'Unknown'
      departmentMap[dept] = (departmentMap[dept] || 0) + 1
    })
    const departmentStats = Object.entries(departmentMap)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count)

    const stats = {
      totalStudents: students.length,
      totalAssessments: assessments.length,
      activeAssessments: assessments.filter(a => a.status === 'available').length,
      totalResults: results.length,
      avgScore: results.length > 0
        ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length)
        : 0,
      passRate: results.length > 0
        ? Math.round((results.filter(r => r.status === 'passed').length / results.length) * 100)
        : 0,
      departmentStats,
      recentResults: results.slice(0, 10)
    }

    res.json({ stats })
  } catch (err) {
    console.error('Manager stats error:', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// GET /api/manager/results — All student results
router.get('/results', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('results')
      .select('*, profiles(name, email, prn, department)')
      .order('completed_at', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })
    res.json({ results: data })
  } catch (err) {
    console.error('Manager results error:', err)
    res.status(500).json({ error: 'Failed to fetch results' })
  }
})

export default router
