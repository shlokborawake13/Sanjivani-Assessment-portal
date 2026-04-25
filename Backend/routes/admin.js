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

// ─── POST /api/admin/attempts/:id/reset — Reset/invalidate a student attempt ───
router.post('/attempts/:id/reset', async (req, res) => {
  try {
    const { reason } = req.body
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason is required (min 3 characters)' })
    }

    // Fetch the attempt
    const { data: attempt, error: fetchErr } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, assessment_id, status, invalidated')
      .eq('id', req.params.id)
      .maybeSingle()

    if (fetchErr || !attempt) return res.status(404).json({ error: 'Attempt not found' })
    if (attempt.invalidated) return res.status(400).json({ error: 'Attempt already invalidated' })

    // Mark attempt as invalidated
    const { error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        invalidated: true,
        invalidated_by: req.user.id,
        invalidated_reason: reason.trim(),
        invalidated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)

    if (updateErr) return res.status(400).json({ error: updateErr.message })

    // Log the reset action (non-fatal)
    try {
      await supabaseAdmin
        .from('attempt_reset_logs')
        .insert({
          attempt_id: attempt.id,
          admin_id: req.user.id,
          student_id: attempt.user_id,
          exam_id: attempt.assessment_id,
          reason: reason.trim(),
          action: 'reset'
        })
    } catch (logErr) {
      console.error('Reset log insert error (non-fatal):', logErr.message)
    }

    res.json({
      message: 'Attempt invalidated successfully. Student can now re-attempt.',
      attempt_id: attempt.id
    })
  } catch (err) {
    console.error('Reset attempt error:', err)
    res.status(500).json({ error: 'Failed to reset attempt' })
  }
})

// ─── GET /api/admin/attempts — List all attempts with filters ───
router.get('/attempts', async (req, res) => {
  try {
    const { assessment_id, status, include_invalidated } = req.query

    let query = supabaseAdmin
      .from('attempts')
      .select('*, assessments(title, category), profiles(name, email, prn, department, year, section)')
      .order('created_at', { ascending: false })
      .limit(500)

    if (assessment_id) query = query.eq('assessment_id', assessment_id)
    if (status) query = query.eq('status', status)
    if (include_invalidated !== 'true') query = query.eq('invalidated', false)

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })
    res.json({ attempts: data })
  } catch (err) {
    console.error('Admin list attempts error:', err)
    res.status(500).json({ error: 'Failed to fetch attempts' })
  }
})

// ─── GET /api/admin/attempts/reset-logs — View reset history ───
router.get('/attempts/reset-logs', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('attempt_reset_logs')
      .select('*, profiles!attempt_reset_logs_admin_id_fkey(name, email)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return res.status(400).json({ error: error.message })
    res.json({ logs: data })
  } catch (err) {
    console.error('Reset logs error:', err)
    res.status(500).json({ error: 'Failed to fetch reset logs' })
  }
})

// ─── GET /api/admin/violations — List all violations with filters ───
router.get('/violations', async (req, res) => {
  try {
    const { assessment_id, severity, type, student_id, limit: limitParam } = req.query
    const pageLimit = Math.min(parseInt(limitParam) || 100, 500)

    let query = supabaseAdmin
      .from('violations')
      .select('*, attempts(user_id, assessment_id, status, profiles(name, email, prn, department), assessments(title, category, assessment_type))')
      .order('created_at', { ascending: false })
      .limit(pageLimit)

    if (severity) query = query.eq('severity', severity)
    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })

    let violations = data || []

    // Post-query filters for nested fields
    if (assessment_id) {
      violations = violations.filter(v => v.attempts?.assessment_id === assessment_id)
    }
    if (student_id) {
      violations = violations.filter(v => v.attempts?.user_id === student_id)
    }

    // Summary stats
    const summary = {
      total: violations.length,
      by_severity: { minor: 0, major: 0, critical: 0 },
      by_source: { client: 0, server: 0 },
      by_type: {}
    }
    violations.forEach(v => {
      summary.by_severity[v.severity || 'minor'] = (summary.by_severity[v.severity || 'minor'] || 0) + 1
      summary.by_source[v.source || 'client'] = (summary.by_source[v.source || 'client'] || 0) + 1
      summary.by_type[v.type] = (summary.by_type[v.type] || 0) + 1
    })

    res.json({ violations, summary })
  } catch (err) {
    console.error('Admin violations error:', err)
    res.status(500).json({ error: 'Failed to fetch violations' })
  }
})

// ─── GET /api/admin/proctoring/:attemptId — Detailed proctoring log ───
router.get('/proctoring/:attemptId', async (req, res) => {
  try {
    const { attemptId } = req.params

    const [sessionRes, violationsRes, attemptRes] = await Promise.all([
      supabaseAdmin
        .from('proctoring_sessions')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('violations')
        .select('*')
        .eq('attempt_id', attemptId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('attempts')
        .select('*, profiles(name, email, prn, department), assessments(title, category, assessment_type)')
        .eq('id', attemptId)
        .maybeSingle()
    ])

    res.json({
      proctoring_session: sessionRes.data || null,
      violations: violationsRes.data || [],
      attempt: attemptRes.data || null,
      violation_count: (violationsRes.data || []).length,
      violation_summary: {
        by_type: (violationsRes.data || []).reduce((acc, v) => {
          acc[v.type] = (acc[v.type] || 0) + 1
          return acc
        }, {}),
        by_severity: (violationsRes.data || []).reduce((acc, v) => {
          acc[v.severity || 'minor'] = (acc[v.severity || 'minor'] || 0) + 1
          return acc
        }, {})
      }
    })
  } catch (err) {
    console.error('Admin proctoring error:', err)
    res.status(500).json({ error: 'Failed to fetch proctoring details' })
  }
})

// ─── GET /api/admin/assessments/:id/stats — Assessment statistics ───
router.get('/assessments/:id/stats', async (req, res) => {
  try {
    const assessmentId = req.params.id

    // Fetch assessment
    const { data: assessment } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .maybeSingle()

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })

    // Fetch all attempts for this assessment
    const { data: attempts } = await supabaseAdmin
      .from('attempts')
      .select('*, profiles(name, email, prn, department, year, section)')
      .eq('assessment_id', assessmentId)
      .eq('invalidated', false)
      .order('created_at', { ascending: false })

    const allAttempts = attempts || []

    // Calculate stats
    const submitted = allAttempts.filter(a => a.status === 'submitted' || a.status === 'auto_submitted')
    const inProgress = allAttempts.filter(a => a.status === 'in_progress')
    const passed = submitted.filter(a => a.percentage >= (assessment.passing_marks || 50))
    const failed = submitted.filter(a => a.percentage < (assessment.passing_marks || 50))

    const scores = submitted.map(a => a.percentage || 0)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : 0
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0

    // Score distribution (0-20, 20-40, 40-60, 60-80, 80-100)
    const distribution = [0, 0, 0, 0, 0]
    scores.forEach(s => {
      if (s < 20) distribution[0]++
      else if (s < 40) distribution[1]++
      else if (s < 60) distribution[2]++
      else if (s < 80) distribution[3]++
      else distribution[4]++
    })

    // Top scorers
    const topScorers = submitted
      .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
      .slice(0, 10)
      .map(a => ({
        name: a.profiles?.name || 'Unknown',
        email: a.profiles?.email,
        prn: a.profiles?.prn,
        department: a.profiles?.department,
        score: a.score,
        total: a.total,
        percentage: a.percentage,
        status: a.percentage >= (assessment.passing_marks || 50) ? 'passed' : 'failed',
        submitted_at: a.submitted_at || a.created_at,
        submission_reason: a.submission_reason,
      }))

    // Per-student data
    const studentData = allAttempts.map(a => ({
      id: a.id,
      student_name: a.profiles?.name || 'Unknown',
      email: a.profiles?.email,
      prn: a.profiles?.prn,
      department: a.profiles?.department,
      year: a.profiles?.year,
      section: a.profiles?.section,
      score: a.score,
      total: a.total,
      percentage: a.percentage,
      status: a.status,
      result_status: a.status === 'in_progress' ? 'in_progress'
        : (a.percentage >= (assessment.passing_marks || 50) ? 'passed' : 'failed'),
      violation_count: a.violation_count || 0,
      submission_reason: a.submission_reason || '',
      auto_submitted: a.auto_submitted || false,
      started_at: a.start_time || a.created_at,
      submitted_at: a.submitted_at,
    }))

    res.json({
      assessment: {
        id: assessment.id,
        title: assessment.title,
        category: assessment.category,
        total_marks: assessment.total_marks,
        passing_marks: assessment.passing_marks,
        max_attempts: assessment.max_attempts,
        duration_minutes: assessment.duration_minutes,
      },
      stats: {
        total_attempts: allAttempts.length,
        submitted_count: submitted.length,
        in_progress_count: inProgress.length,
        passed_count: passed.length,
        failed_count: failed.length,
        pass_rate: submitted.length > 0 ? Math.round((passed.length / submitted.length) * 100) : 0,
        avg_score: avgScore,
        highest_score: highestScore,
        lowest_score: lowestScore,
        score_distribution: {
          '0-20': distribution[0],
          '20-40': distribution[1],
          '40-60': distribution[2],
          '60-80': distribution[3],
          '80-100': distribution[4],
        }
      },
      top_scorers: topScorers,
      students: studentData,
    })
  } catch (err) {
    console.error('Assessment stats error:', err)
    res.status(500).json({ error: 'Failed to fetch assessment stats' })
  }
})

// ─── GET /api/admin/assessments/:id/export-csv — Export results as CSV ───
router.get('/assessments/:id/export-csv', async (req, res) => {
  try {
    const assessmentId = req.params.id

    // Fetch assessment
    const { data: assessment } = await supabaseAdmin
      .from('assessments')
      .select('title, category, total_marks, passing_marks')
      .eq('id', assessmentId)
      .maybeSingle()

    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })

    // Fetch all attempts
    const { data: attempts } = await supabaseAdmin
      .from('attempts')
      .select('*, profiles(name, email, prn, department, year, section)')
      .eq('assessment_id', assessmentId)
      .eq('invalidated', false)
      .order('created_at', { ascending: false })

    const allAttempts = attempts || []

    // Build CSV
    const headers = [
      'Student Name', 'Email', 'PRN', 'Department', 'Year', 'Section',
      'Score', 'Total Marks', 'Percentage', 'Status', 'Result',
      'Violations', 'Auto-Submitted', 'Submission Reason',
      'Started At', 'Submitted At'
    ]

    const rows = allAttempts.map(a => {
      const passingMarks = assessment.passing_marks || 50
      const resultStatus = a.status === 'in_progress' ? 'In Progress'
        : (a.percentage >= passingMarks ? 'Passed' : 'Failed')

      return [
        escapeCSV(a.profiles?.name || ''),
        escapeCSV(a.profiles?.email || ''),
        escapeCSV(a.profiles?.prn || ''),
        escapeCSV(a.profiles?.department || ''),
        escapeCSV(a.profiles?.year || ''),
        escapeCSV(a.profiles?.section || ''),
        a.score ?? '',
        a.total ?? '',
        a.percentage != null ? `${a.percentage}%` : '',
        a.status || '',
        resultStatus,
        a.violation_count || 0,
        a.auto_submitted ? 'Yes' : 'No',
        escapeCSV(a.submission_reason || ''),
        a.start_time || a.created_at || '',
        a.submitted_at || '',
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')

    // Set response headers for CSV download
    const filename = `${(assessment.title || 'assessment').replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)
  } catch (err) {
    console.error('Export CSV error:', err)
    res.status(500).json({ error: 'Failed to export CSV' })
  }
})

function escapeCSV(str) {
  if (typeof str !== 'string') return str
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export default router
