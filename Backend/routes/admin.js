import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)
router.use(roleGuard('admin'))

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

// GET /api/admin/users — List all users with auth metadata
router.get('/users', async (req, res) => {
  try {
    // Fetch ALL profiles — no role filter, explicit large range to bypass default 1000 limit
    const profilesRes = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 9999)

    if (profilesRes.error) {
      console.error('❌ /admin/users profiles query error:', profilesRes.error)
      return res.status(400).json({ error: profilesRes.error.message })
    }

    console.log(`📊 /admin/users: fetched ${(profilesRes.data || []).length} profiles from DB`)

    // Fetch auth metadata separately — non-fatal if it fails
    const authMap = await getAuthUsersMap()

    const users = (profilesRes.data || []).map(p => {
      const authUser = authMap[p.id]
      return {
        ...p,
        is_active: authUser
          ? !(authUser.banned_until && new Date(authUser.banned_until) > new Date())
          : true,
        last_sign_in: authUser?.last_sign_in_at || null,
        confirmed: authUser?.email_confirmed_at ? true : false
      }
    })

    res.json({ users })
  } catch (err) {
    console.error('List users error:', err)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// PUT /api/admin/users/:id/status — Toggle active/inactive (ban/unban)
router.put('/users/:id/status', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' })
    }

    const { is_active } = req.body

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' })
    }

    let result
    try {
      result = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
        ban_duration: is_active ? 'none' : '876600h'
      })
    } catch (supaErr) {
      console.error('Supabase updateUserById threw:', supaErr.message)
      return res.status(502).json({ error: 'Failed to reach authentication service. Please try again.' })
    }

    if (result.error) {
      return res.status(400).json({ error: result.error.message })
    }

    res.json({ is_active })
  } catch (err) {
    console.error('Toggle status error:', err)
    res.status(500).json({ error: 'Failed to update status' })
  }
})

// PUT /api/admin/users/:id/role — Change user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body
    if (!role || !['student', 'manager', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Valid role (student, manager, admin) is required' })
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'User not found' })
    res.json({ user: data })
  } catch (err) {
    console.error('Change role error:', err)
    res.status(500).json({ error: 'Failed to change role' })
  }
})

// DELETE /api/admin/users/:id — Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    // Prevent deleting self
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    // Delete profile photo from storage
    try {
      const { data: files } = await supabaseAdmin.storage
        .from('profiles')
        .list(req.params.id)

      if (files && files.length > 0) {
        const filePaths = files.map(f => `${req.params.id}/${f.name}`)
        await supabaseAdmin.storage.from('profiles').remove(filePaths)
      }
    } catch (storageErr) {
      console.error('Storage cleanup failed (non-fatal):', storageErr.message)
    }

    // Delete profile row
    await supabaseAdmin.from('profiles').delete().eq('id', req.params.id)

    // Delete auth user
    try {
      await supabaseAdmin.auth.admin.deleteUser(req.params.id)
    } catch (authErr) {
      console.error('Auth user deletion failed (non-fatal):', authErr.message)
    }

    res.json({ message: 'User deleted successfully' })
  } catch (err) {
    console.error('Delete user error:', err)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

// GET /api/admin/stats — Dashboard stats (single source of truth)
router.get('/stats', async (req, res) => {
  try {
    // CRITICAL: Fetch ALL profiles in a single unfiltered query
    // supabaseAdmin uses service_role key which bypasses RLS
    // .range(0, 9999) overcomes Supabase's default 1000-row limit
    const [profilesRes, assessmentsRes, resultsRes, ticketsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').range(0, 9999),
      supabaseAdmin.from('assessments').select('id, status'),
      supabaseAdmin.from('results').select('id, percentage, status'),
      supabaseAdmin.from('support_tickets').select('id, status')
    ])

    // Debug: Log raw results to catch issues
    if (profilesRes.error) {
      console.error('❌ Profiles query error:', profilesRes.error)
    }

    const allUsers = profilesRes.data || []
    const assessments = assessmentsRes.data || []
    const results = resultsRes.data || []
    const tickets = ticketsRes.data || []

    // Debug logging — if this shows 1, query is broken or RLS is blocking
    console.log(`📊 Admin stats: ${allUsers.length} total users fetched from profiles table`)

    // Compute counts from the full unfiltered list — NO server-side filtering
    const totalUsers = allUsers.length
    const totalStudents = allUsers.filter(u => u.role === 'student').length
    const totalManagers = allUsers.filter(u => u.role === 'manager').length
    const totalAdmins = allUsers.filter(u => u.role === 'admin').length

    const stats = {
      totalUsers,
      totalStudents,
      totalManagers,
      totalAdmins,
      totalAssessments: assessments.length,
      activeAssessments: assessments.filter(a => a.status === 'available').length,
      totalResults: results.length,
      avgScore: results.length > 0
        ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length)
        : 0,
      passRate: results.length > 0
        ? Math.round((results.filter(r => r.status === 'passed').length / results.length) * 100)
        : 0,
      totalTickets: tickets.length,
      openTickets: tickets.filter(t => t.status === 'open').length,
    }

    // Debug: Log final stats
    console.log(`📊 Admin stats result: totalUsers=${stats.totalUsers}, students=${stats.totalStudents}, managers=${stats.totalManagers}, admins=${stats.totalAdmins}`)

    res.json({ stats })
  } catch (err) {
    console.error('Admin stats error:', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// GET /api/admin/results — All student results
router.get('/results', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('results')
      .select('*, profiles(name, email, prn, department)')
      .order('completed_at', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })
    res.json({ results: data })
  } catch (err) {
    console.error('Admin results error:', err)
    res.status(500).json({ error: 'Failed to fetch results' })
  }
})

export default router
