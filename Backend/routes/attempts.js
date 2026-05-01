import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)

// ─── Helpers ──────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function parseDurationMinutes(assessment) {
  // Prefer numeric duration_minutes, fall back to parsing string
  if (assessment.duration_minutes && assessment.duration_minutes > 0) {
    return assessment.duration_minutes
  }
  const match = (assessment.duration || '').match(/(\d+)/)
  return match ? parseInt(match[1]) : 60
}

// ─── POST /api/attempts — Start a new attempt ────────────
router.post('/', async (req, res) => {
  try {
    const { assessment_id } = req.body
    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' })

    // 1. Fetch assessment
    const { data: assessment, error: aErr } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .maybeSingle()

    if (aErr || !assessment) return res.status(404).json({ error: 'Assessment not found' })

    // 2. Check active status
    if (assessment.is_active === false) {
      return res.status(400).json({ error: 'This exam is not currently active' })
    }
    // Legacy status check
    if (assessment.status !== 'available' && assessment.is_active !== true) {
      return res.status(400).json({ error: 'Assessment is not available' })
    }

    // 3. Check scheduling window
    const now = new Date()
    if (assessment.start_time) {
      const startTime = new Date(assessment.start_time)
      if (now < startTime) {
        return res.status(400).json({
          error: 'This exam has not started yet',
          starts_at: assessment.start_time
        })
      }
    }
    if (assessment.end_time) {
      let deadline = new Date(assessment.end_time)
      // Allow late entry if enabled
      if (assessment.allow_late_entry && assessment.late_entry_minutes > 0) {
        deadline = new Date(deadline.getTime() + assessment.late_entry_minutes * 60 * 1000)
      }
      if (now > deadline) {
        return res.status(400).json({ error: 'This exam window has closed' })
      }
    }

    // 4. Check target audience (unless open_to_all)
    if (!assessment.open_to_all) {
      const profile = req.user.profile
      const targetDepts = assessment.target_departments || []
      const targetYears = assessment.target_years || []
      const targetSections = assessment.target_sections || []

      if (targetDepts.length > 0 && !targetDepts.includes(profile.department)) {
        return res.status(403).json({ error: 'This exam is not available for your department' })
      }
      if (targetYears.length > 0 && !targetYears.includes(profile.year)) {
        return res.status(403).json({ error: 'This exam is not available for your year' })
      }
      if (targetSections.length > 0 && !targetSections.includes(profile.section || profile.division)) {
        return res.status(403).json({ error: 'This exam is not available for your section' })
      }
    }

    // 5. Check for existing in-progress attempt (resume)
    const { data: existingInProgress } = await supabaseAdmin
      .from('attempts')
      .select('id, answers, start_time, end_time, violation_count, status')
      .eq('user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('status', 'in_progress')
      .eq('invalidated', false)
      .maybeSingle()

    if (existingInProgress) {
      // Check if time expired on existing attempt
      if (existingInProgress.end_time && now > new Date(existingInProgress.end_time)) {
        // Auto-submit the expired attempt
        await autoSubmitAttempt(existingInProgress.id, assessment_id, 'Timer expired (server-side)')
        // Fall through to create new attempt if allowed
      } else {
        // Resume — load questions
        const questions = await loadQuestions(assessment_id, assessment)
        return res.json({
          attempt: existingInProgress,
          questions,
          resumed: true,
          exam: sanitizeAssessment(assessment)
        })
      }
    }

    // 6. Check max attempts (exclude invalidated)
    const { count: attemptCount } = await supabaseAdmin
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('invalidated', false)
      .neq('status', 'in_progress') // Don't count expired in-progress as a used attempt

    const maxAttempts = assessment.max_attempts || 1
    if (attemptCount >= maxAttempts) {
      return res.status(400).json({
        error: 'Maximum attempts reached',
        attempts_used: attemptCount,
        max_attempts: maxAttempts
      })
    }

    // 7. Get question count
    const { count: questionCount } = await supabaseAdmin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessment_id)

    if (!questionCount || questionCount === 0) {
      return res.status(400).json({
        error: 'No questions found for this assessment. Please contact your administrator to upload questions.'
      })
    }

    // 8. Calculate times
    const durationMinutes = parseDurationMinutes(assessment)
    const startTime = new Date()
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

    // 9. Create attempt
    const { data: attempt, error: createErr } = await supabaseAdmin
      .from('attempts')
      .insert({
        user_id: req.user.id,
        assessment_id,
        total: questionCount || 0,
        strict_mode_enabled: assessment.exam_type === 'proctored',
        status: 'in_progress',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        answers: [],
        score: 0,
        violation_count: 0,
        auto_submitted: false,
        invalidated: false
      })
      .select()
      .maybeSingle()

    if (createErr || !attempt) {
      console.error('Attempt create error:', createErr)
      return res.status(500).json({ error: 'Failed to create attempt' })
    }

    // 10. Load questions
    const questions = await loadQuestions(assessment_id, assessment)

    res.status(201).json({
      attempt,
      questions,
      resumed: false,
      exam: sanitizeAssessment(assessment)
    })
  } catch (err) {
    console.error('Start attempt error:', err)
    res.status(500).json({ error: 'Failed to start attempt' })
  }
})


// ─── POST /api/attempts/:id/save-progress — Auto-save ───
router.post('/:id/save-progress', async (req, res) => {
  try {
    const { answers } = req.body

    // Fetch attempt
    const { data: attempt, error: fetchErr } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, status, end_time, invalidated')
      .eq('id', req.params.id)
      .maybeSingle()

    if (fetchErr || !attempt) return res.status(404).json({ error: 'Attempt not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    if (attempt.invalidated) return res.status(400).json({ error: 'Attempt has been invalidated' })

    // Allow save even if status is already submitted (idempotent, but skip update)
    if (attempt.status !== 'in_progress') {
      return res.json({ saved: false, reason: 'Attempt already submitted' })
    }

    // Check time — allow save even if slightly past (grace period of 30s)
    const now = new Date()
    if (attempt.end_time) {
      const endTime = new Date(attempt.end_time)
      const graceEnd = new Date(endTime.getTime() + 30 * 1000)
      if (now > graceEnd) {
        // Auto-submit since time expired
        await autoSubmitAttempt(attempt.id, null, 'Timer expired during save')
        return res.json({ saved: false, reason: 'Time expired — auto-submitted', autoSubmitted: true })
      }
    }

    // Save answers
    const { error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({ answers: answers || [] })
      .eq('id', req.params.id)

    if (updateErr) return res.status(400).json({ error: updateErr.message })

    res.json({ saved: true, savedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Save progress error:', err)
    res.status(500).json({ error: 'Failed to save progress' })
  }
})

// ─── PUT /api/attempts/:id/submit — Submit attempt ──────
router.put('/:id/submit', async (req, res) => {
  try {
    const { answers, auto_submit, submission_reason } = req.body

    // 1. Fetch attempt with assessment data
    const { data: attempt, error: fetchErr } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(id, title, category, total_marks, passing_marks, show_results_immediately)')
      .eq('id', req.params.id)
      .maybeSingle()

    // Validate: Attempt exists
    if (fetchErr || !attempt) {
      return res.status(404).json({ error: 'Attempt not found' })
    }

    // Validate: Ownership
    if (attempt.user_id !== req.user.id && req.user.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Validate: Not invalidated
    if (attempt.invalidated) {
      return res.status(400).json({ error: 'This attempt has been invalidated' })
    }

    // Validate: Not already submitted — return current result gracefully
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Attempt already submitted',
        already_submitted: true,
        score: attempt.score,
        total: attempt.total,
        percentage: attempt.percentage,
        status: attempt.status
      })
    }

    // Validate: Time not expired (unless auto-submit)
    const now = new Date()
    if (!auto_submit && attempt.end_time) {
      const endTime = new Date(attempt.end_time)
      // Allow 60 second grace period for network latency
      const graceEnd = new Date(endTime.getTime() + 60 * 1000)
      if (now > graceEnd) {
        return res.status(400).json({
          error: 'Exam time has expired',
          time_expired: true
        })
      }
    }

    // 2. Finalize answers — use submitted answers, or fall back to saved answers
    const finalAnswers = answers || attempt.answers || []

    // 3. Fetch correct answers and grade
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, correct_answer')
      .eq('assessment_id', attempt.assessment_id)
      .order('sort_order')

    let score = 0
    const total = questions?.length || attempt.total || 0

    if (questions && finalAnswers.length > 0) {
      // Build a map of question_id -> correct_answer
      const correctMap = {}
      questions.forEach(q => { correctMap[q.id] = q.correct_answer })

      // Grade each answer
      finalAnswers.forEach(ans => {
        if (ans && ans.question_id && ans.selected) {
          if (correctMap[ans.question_id] && ans.selected === correctMap[ans.question_id]) {
            score++
          }
        }
      })
    }

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0
    const isAutoSubmit = !!auto_submit
    const status = isAutoSubmit ? 'auto_submitted' : 'submitted'

    // 4. Get violation count
    let violationCount = 0
    try {
      const { count } = await supabaseAdmin
        .from('violations')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', req.params.id)
      violationCount = count || 0
    } catch (e) { violationCount = attempt.violation_count || 0 }

    // 5. Update attempt
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        answers: finalAnswers,
        score,
        total,
        percentage,
        status,
        auto_submitted: isAutoSubmit,
        submission_reason: submission_reason || (isAutoSubmit ? 'Auto-submitted' : 'Manual submission'),
        violation_count: violationCount,
        submitted_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle()

    if (updateErr) {
      console.error('Submit update error:', updateErr)
      return res.status(500).json({ error: 'Failed to save submission' })
    }

    // 6. Save to results table (non-fatal)
    const passingMarks = attempt.assessments?.passing_marks || 50
    const resultStatus = percentage >= passingMarks ? 'passed' : 'failed'
    const resultCategory = attempt.assessments?.category || 'General'
    try {
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
      })
    } catch (e) { /* non-fatal */ }

    // 7. Update profile scores for leaderboard (non-fatal)
    try {
      await updateProfileScores(attempt.user_id, resultCategory, percentage)
    } catch (e) {
      console.error('Profile score update error (non-fatal):', e.message)
    }

    const showResults = attempt.assessments?.show_results_immediately !== false

    res.json({
      score: showResults ? score : undefined,
      total: showResults ? total : undefined,
      percentage: showResults ? percentage : undefined,
      status: resultStatus,
      submitted: true,
      attempt: showResults ? updated : { id: updated.id, status: updated.status }
    })
  } catch (err) {
    console.error('Submit attempt error:', err)
    res.status(500).json({ error: 'Failed to submit attempt' })
  }
})

// ─── POST /api/attempts/:id/violation — Log a violation ──
router.post('/:id/violation', async (req, res) => {
  try {
    const { type, details } = req.body
    if (!type) return res.status(400).json({ error: 'Violation type is required' })

    // Verify attempt belongs to user
    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, status, warnings_log, violation_count, assessment_id')
      .eq('id', req.params.id)
      .maybeSingle()

    if (!attempt) return res.status(404).json({ error: 'Attempt not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    if (attempt.status !== 'in_progress') {
      return res.json({ logged: false, reason: 'Attempt already submitted' })
    }

    // Insert violation record
    try {
      await supabaseAdmin
        .from('violations')
        .insert({
          attempt_id: req.params.id,
          type,
          details: details || ''
        })
    } catch {} // non-fatal if violations table has issues

    // Update attempt warnings log
    const warningsLog = attempt.warnings_log || []
    warningsLog.push({ type, details, timestamp: new Date().toISOString() })
    const newViolationCount = (attempt.violation_count || 0) + 1

    await supabaseAdmin
      .from('attempts')
      .update({
        warnings_log: warningsLog,
        violation_count: newViolationCount
      })
      .eq('id', req.params.id)

    // Check if violation threshold reached (3) — trigger server-side auto-submit
    let autoSubmitted = false
    if (newViolationCount >= 3) {
      await autoSubmitAttempt(req.params.id, attempt.assessment_id, `Violation limit exceeded (${type})`)
      autoSubmitted = true
    }

    res.json({
      logged: true,
      violation_count: newViolationCount,
      autoSubmitted
    })
  } catch (err) {
    console.error('Log violation error:', err)
    res.status(500).json({ error: 'Failed to log violation' })
  }
})

// ─── GET /api/attempts/:id/restore — Restore state ──────
router.get('/:id/restore', async (req, res) => {
  try {
    const { data: attempt, error } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(id, title, category, duration, duration_minutes, exam_type, shuffle_questions, shuffle_options, show_results_immediately, instructions)')
      .eq('id', req.params.id)
      .maybeSingle()

    if (error || !attempt) return res.status(404).json({ error: 'Attempt not found' })

    // Verify ownership
    if (attempt.user_id !== req.user.id && !['admin', 'manager'].includes(req.user.profile.role)) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // If attempt is still in progress, check if time expired
    if (attempt.status === 'in_progress' && attempt.end_time) {
      const now = new Date()
      if (now > new Date(attempt.end_time)) {
        // Auto-submit
        await autoSubmitAttempt(attempt.id, attempt.assessment_id, 'Timer expired (restore check)')
        const { data: updated } = await supabaseAdmin
          .from('attempts')
          .select('*')
          .eq('id', req.params.id)
          .maybeSingle()
        return res.json({ attempt: updated, expired: true })
      }
    }

    // Load questions if still in progress
    let questions = []
    if (attempt.status === 'in_progress') {
      questions = await loadQuestions(attempt.assessment_id, attempt.assessments)
    }

    res.json({
      attempt,
      questions,
      exam: attempt.assessments ? sanitizeAssessment(attempt.assessments) : null
    })
  } catch (err) {
    console.error('Restore attempt error:', err)
    res.status(500).json({ error: 'Failed to restore attempt' })
  }
})

// ─── GET /api/attempts — List attempts ──────────────────
router.get('/', async (req, res) => {
  try {
    const role = req.user.profile.role
    let query = supabaseAdmin
      .from('attempts')
      .select('*, assessments(title, category), profiles(name, email, prn, department)')
      .eq('invalidated', false)
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

// ─── GET /api/attempts/:id — Get attempt details ────────
router.get('/:id', async (req, res) => {
  try {
    const { data: attempt, error } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(title, category, duration, duration_minutes), violations(*)')
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

// ─── Helper: Load questions for an assessment ───────────
async function loadQuestions(assessmentId, assessment) {
  const shouldShuffle = assessment?.shuffle_questions !== false

  let selectFields = 'id, assessment_id, question_text, option_a, option_b, option_c, option_d, question_type, difficulty, sort_order'

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select(selectFields)
    .eq('assessment_id', assessmentId)
    .order('sort_order')

  if (!questions || questions.length === 0) return []

  const ordered = shouldShuffle ? shuffle(questions) : questions

  // Optionally shuffle options per question
  const shouldShuffleOpts = assessment?.shuffle_options !== false

  return ordered.map((q, idx) => {
    const options = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }

    let displayOptions = options
    let optionMapping = { A: 'A', B: 'B', C: 'C', D: 'D' } // display -> original

    if (shouldShuffleOpts) {
      const entries = Object.entries(options).filter(([, v]) => v)
      const shuffled = shuffle(entries)
      displayOptions = {}
      optionMapping = {}
      const labels = ['A', 'B', 'C', 'D']
      shuffled.forEach(([origKey, value], i) => {
        displayOptions[labels[i]] = value
        optionMapping[labels[i]] = origKey
      })
    }

    return {
      id: q.id,
      index: idx,
      question_text: q.question_text,
      options: displayOptions,
      optionMapping, // frontend needs this to map back when submitting
      question_type: q.question_type || 'mcq',
      difficulty: q.difficulty || 'Intermediate'
    }
  })
}

// ─── Helper: Auto-submit an attempt ─────────────────────
async function autoSubmitAttempt(attemptId, assessmentId, reason) {
  try {
    // Fetch attempt
    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(id, title, category, passing_marks)')
      .eq('id', attemptId)
      .maybeSingle()

    if (!attempt || attempt.status !== 'in_progress') return

    // If we don't have assessmentId, get it from the attempt
    const aId = assessmentId || attempt.assessment_id

    // Fetch correct answers
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, correct_answer')
      .eq('assessment_id', aId)

    // Grade answers
    const savedAnswers = attempt.answers || []
    let score = 0
    const total = questions?.length || 0
    const correctMap = {}
    ;(questions || []).forEach(q => { correctMap[q.id] = q.correct_answer })

    savedAnswers.forEach(ans => {
      if (ans?.question_id && ans?.selected && correctMap[ans.question_id] === ans.selected) {
        score++
      }
    })

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0

    // Get violation count
    let violationCount = 0
    try {
      const { count } = await supabaseAdmin
        .from('violations')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', attemptId)
      violationCount = count || 0
    } catch (e) { violationCount = attempt.violation_count || 0 }

    // Update attempt
    await supabaseAdmin
      .from('attempts')
      .update({
        score,
        total,
        percentage,
        status: 'auto_submitted',
        auto_submitted: true,
        submission_reason: reason || 'Auto-submitted',
        violation_count: violationCount,
        submitted_at: new Date().toISOString()
      })
      .eq('id', attemptId)

    // Save to results
    const passingMarks = attempt.assessments?.passing_marks || 50
    const resultStatus = percentage >= passingMarks ? 'passed' : 'failed'
    const resultCategory = attempt.assessments?.category || 'General'

    try { await supabaseAdmin.from('results').insert({
      user_id: attempt.user_id,
      assessment_id: aId,
      assessment_title: attempt.assessments?.title || 'Unknown',
      category: resultCategory,
      score,
      total,
      percentage,
      status: resultStatus,
      duration: ''
    }) } catch {}

    // Update profile scores
    try {
      await updateProfileScores(attempt.user_id, resultCategory, percentage)
    } catch (e) { /* non-fatal */ }

  } catch (err) {
    console.error('Auto-submit error:', err)
  }
}

// ─── Helper: Sanitize assessment for frontend ───────────
function sanitizeAssessment(a) {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    duration: a.duration,
    duration_minutes: a.duration_minutes,
    exam_type: a.exam_type,
    shuffle_questions: a.shuffle_questions,
    shuffle_options: a.shuffle_options,
    show_results_immediately: a.show_results_immediately,
    instructions: a.instructions,
    total_marks: a.total_marks,
    passing_marks: a.passing_marks,
    require_camera: a.require_camera || false,
    require_mic: a.require_mic || false,
    max_violations: a.max_violations || 3,
  }
}

// ─── Helper: Update profile scores for leaderboard ──────
async function updateProfileScores(userId, category, percentage) {
  const { data: catResults } = await supabaseAdmin
    .from('results')
    .select('percentage')
    .eq('user_id', userId)
    .eq('category', category)

  const catAvg = catResults && catResults.length > 0
    ? Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length)
    : percentage

  const scoreColumn = category.toLowerCase() === 'aptitude' ? 'aptitude_score'
    : category.toLowerCase() === 'coding' ? 'coding_score'
    : category.toLowerCase() === 'communication' ? 'communication_score'
    : null

  const updateObj = {}
  if (scoreColumn) updateObj[scoreColumn] = catAvg

  const { count: totalSolved } = await supabaseAdmin
    .from('results')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  updateObj.total_problems_solved = totalSolved || 0

  // Update streak
  const today = new Date().toISOString().split('T')[0]
  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('current_streak, max_streak, last_active_date')
    .eq('id', userId)
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
    } else {
      newStreak = 1
    }

    updateObj.current_streak = newStreak
    updateObj.max_streak = Math.max(newStreak, prof.max_streak || 0)
    updateObj.last_active_date = today
  }

  await supabaseAdmin.from('profiles').update(updateObj).eq('id', userId)
}

export default router
