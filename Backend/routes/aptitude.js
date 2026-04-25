import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { rateLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(authenticate)

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me'
const BATCH_SIZE = 5
const SPEED_THRESHOLD = 3 // seconds — avg below this = flagged

// ─── Helpers ──────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shuffleOptions(question) {
  const originalOptions = [
    { key: 'A', text: question.option_a },
    { key: 'B', text: question.option_b },
    { key: 'C', text: question.option_c },
    { key: 'D', text: question.option_d },
  ].filter(o => o.text)
  const shuffled = shuffle(originalOptions)
  const mapping = {}
  const labels = ['A', 'B', 'C', 'D']
  shuffled.forEach((opt, idx) => { mapping[labels[idx]] = opt.key })
  return { shuffled, mapping }
}

function signQuestionToken(questionId, sessionId) {
  return jwt.sign({ qid: questionId, sid: sessionId }, JWT_SECRET, { expiresIn: '3h' })
}

function verifyQuestionToken(token) {
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

// Session store — keeps question order & answered questions in memory
// (no extra DB columns needed, so no migration dependency)
const sessionStore = new Map()

function getSession(attemptId) {
  return sessionStore.get(attemptId) || null
}

function setSession(attemptId, data) {
  sessionStore.set(attemptId, data)
  // Auto-cleanup after 4 hours
  setTimeout(() => sessionStore.delete(attemptId), 4 * 60 * 60 * 1000)
}

// ─── POST /session/start ──────────────────────────────────
router.post('/session/start', async (req, res) => {
  try {
    const { assessment_id } = req.body
    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' })

    const { data: assessment, error: aErr } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .maybeSingle()

    if (aErr) {
      console.error('Assessment fetch error:', aErr)
      return res.status(500).json({ error: 'Database error: ' + aErr.message })
    }
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })
    if (assessment.status !== 'available') return res.status(400).json({ error: 'Assessment is not available' })

    // Check for existing in-progress attempt
    const { data: existing } = await supabaseAdmin
      .from('attempts')
      .select('id, answers, total')
      .eq('user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (existing) {
      // Resume — rebuild session from attempt data
      const { data: questions } = await supabaseAdmin
        .from('questions')
        .select('id')
        .eq('assessment_id', assessment_id)

      const totalQ = questions?.length || existing.total || 0
      let session = getSession(existing.id)
      if (!session) {
        // Re-create session state from the attempt's answers
        const shuffledIds = shuffle((questions || []).map(q => q.id))
        const answeredMap = {}
        ;(existing.answers || []).forEach(a => {
          if (a.selected) answeredMap[a.question_id] = a.selected
        })
        session = { shuffledIds, optionMaps: {}, answeredMap, timeTaken: {} }
        setSession(existing.id, session)
      }

      return res.json({
        sessionId: existing.id,
        resumed: true,
        totalQuestions: totalQ,
        answeredCount: Object.keys(session.answeredMap || {}).length,
        duration: assessment.duration,
        perQuestionTime: assessment.per_question_time || 0,
        title: assessment.title,
        category: assessment.category,
      })
    }

    // Fetch all questions
    const { data: questions, error: qErr } = await supabaseAdmin
      .from('questions')
      .select('id, option_a, option_b, option_c, option_d')
      .eq('assessment_id', assessment_id)

    if (qErr) {
      console.error('Questions fetch error:', qErr)
      return res.status(500).json({ error: 'Database error: ' + qErr.message })
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No questions found for this assessment' })
    }

    // Shuffle question order and options
    const shuffledIds = shuffle(questions.map(q => q.id))
    const optionMaps = {}
    questions.forEach(q => {
      const { mapping } = shuffleOptions(q)
      optionMaps[q.id] = mapping
    })

    // Create attempt
    const { data: attempt, error: createErr } = await supabaseAdmin
      .from('attempts')
      .insert({
        user_id: req.user.id,
        assessment_id,
        total: shuffledIds.length,
        strict_mode_enabled: true,
        status: 'in_progress',
      })
      .select()
      .maybeSingle()

    if (createErr || !attempt) {
      console.error('Attempt create error:', createErr)
      return res.status(500).json({ error: 'Failed to create session: ' + (createErr?.message || 'unknown') })
    }

    // Store session in memory
    setSession(attempt.id, {
      shuffledIds,
      optionMaps,
      answeredMap: {},   // questionId -> original answer
      timeTaken: {},     // questionId -> seconds
    })

    res.status(201).json({
      sessionId: attempt.id,
      resumed: false,
      totalQuestions: shuffledIds.length,
      answeredCount: 0,
      duration: assessment.duration,
      perQuestionTime: assessment.per_question_time || 0,
      title: assessment.title,
      category: assessment.category,
    })
  } catch (err) {
    console.error('Session start error:', err)
    res.status(500).json({ error: 'Failed to start session: ' + err.message })
  }
})

// ─── GET /session/:sessionId/questions?batch=0 ────────────
router.get(
  '/session/:sessionId/questions',
  rateLimiter({ windowMs: 60000, max: 30, message: 'Too many question requests' }),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const batch = parseInt(req.query.batch) || 0

      const { data: attempt } = await supabaseAdmin
        .from('attempts')
        .select('id, user_id, status, assessment_id')
        .eq('id', sessionId)
        .maybeSingle()

      if (!attempt) return res.status(404).json({ error: 'Session not found' })
      if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
      if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Session already submitted' })

      let session = getSession(sessionId)
      if (!session) {
        // Recreate from DB
        const { data: questions } = await supabaseAdmin
          .from('questions')
          .select('id, option_a, option_b, option_c, option_d')
          .eq('assessment_id', attempt.assessment_id)

        const shuffledIds = shuffle((questions || []).map(q => q.id))
        const optionMaps = {}
        ;(questions || []).forEach(q => {
          const { mapping } = shuffleOptions(q)
          optionMaps[q.id] = mapping
        })
        const answeredMap = {}
        ;(attempt.answers || []).forEach(a => {
          if (a?.selected) answeredMap[a.question_id] = a.selected
        })
        session = { shuffledIds, optionMaps, answeredMap: answeredMap || {}, timeTaken: {} }
        setSession(sessionId, session)
      }

      const shuffledOrder = session.shuffledIds || []
      const start = batch * BATCH_SIZE
      const end = Math.min(start + BATCH_SIZE, shuffledOrder.length)

      if (start >= shuffledOrder.length) {
        return res.json({ questions: [], hasMore: false, batch })
      }

      const batchIds = shuffledOrder.slice(start, end)

      const { data: questions } = await supabaseAdmin
        .from('questions')
        .select('id, question_text, option_a, option_b, option_c, option_d, question_type, difficulty')
        .in('id', batchIds)

      const questionMap = {}
      ;(questions || []).forEach(q => { questionMap[q.id] = q })

      const result = batchIds.map((qid, idx) => {
        const q = questionMap[qid]
        if (!q) return null

        const qOptionMap = session.optionMaps[qid] || { A: 'A', B: 'B', C: 'C', D: 'D' }
        const displayedOptions = {}
        const labels = ['A', 'B', 'C', 'D']
        labels.forEach(displayLabel => {
          const originalLabel = qOptionMap[displayLabel]
          if (originalLabel) {
            displayedOptions[displayLabel] = q[`option_${originalLabel.toLowerCase()}`]
          }
        })

        return {
          index: start + idx,
          id: q.id,
          question_text: q.question_text,
          options: displayedOptions,
          question_type: q.question_type || 'mcq',
          difficulty: q.difficulty || 'Intermediate',
          token: signQuestionToken(q.id, sessionId),
          answered: session.answeredMap[qid] ? Object.entries(qOptionMap).find(
            ([disp, orig]) => orig === session.answeredMap[qid]
          )?.[0] || null : null,
        }
      }).filter(Boolean)

      res.json({
        questions: result,
        hasMore: end < shuffledOrder.length,
        batch,
        totalQuestions: shuffledOrder.length,
      })
    } catch (err) {
      console.error('Get questions error:', err)
      res.status(500).json({ error: 'Failed to fetch questions' })
    }
  }
)

// ─── POST /session/:sessionId/answer ──────────────────────
router.post(
  '/session/:sessionId/answer',
  rateLimiter({ windowMs: 60000, max: 60, message: 'Too many answer submissions' }),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const { token, selected_option, time_taken } = req.body

      if (!token || !selected_option) {
        return res.status(400).json({ error: 'token and selected_option are required' })
      }

      const decoded = verifyQuestionToken(token)
      if (!decoded) return res.status(401).json({ error: 'Invalid or expired question token' })
      if (decoded.sid !== sessionId) return res.status(400).json({ error: 'Token session mismatch' })

      const questionId = decoded.qid

      const { data: attempt } = await supabaseAdmin
        .from('attempts')
        .select('id, user_id, status')
        .eq('id', sessionId)
        .maybeSingle()

      if (!attempt) return res.status(404).json({ error: 'Session not found' })
      if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
      if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Session already submitted' })

      const session = getSession(sessionId)
      if (!session) return res.status(400).json({ error: 'Session expired — please restart' })

      // Check for duplicate
      if (session.answeredMap[questionId]) {
        return res.status(409).json({ error: 'Answer already submitted for this question' })
      }

      // Map displayed option back to original
      const qOptionMap = session.optionMaps[questionId] || { A: 'A', B: 'B', C: 'C', D: 'D' }
      const originalOption = qOptionMap[selected_option] || selected_option

      // Record answer in session
      session.answeredMap[questionId] = originalOption
      session.timeTaken[questionId] = Math.max(0, parseInt(time_taken) || 0)

      // Also persist to DB — update the answers array on the attempt
      const answersArray = session.shuffledIds.map(qid => ({
        question_id: qid,
        selected: session.answeredMap[qid] || null,
      }))

      await supabaseAdmin
        .from('attempts')
        .update({ answers: answersArray })
        .eq('id', sessionId)

      res.json({
        accepted: true,
        questionId,
        answeredCount: Object.keys(session.answeredMap).length,
      })
    } catch (err) {
      console.error('Answer submission error:', err)
      res.status(500).json({ error: 'Failed to submit answer' })
    }
  }
)

// ─── POST /session/:sessionId/submit ──────────────────────
router.post('/session/:sessionId/submit', async (req, res) => {
  try {
    const { sessionId } = req.params
    const { submission_reason } = req.body

    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(id, title, category)')
      .eq('id', sessionId)
      .maybeSingle()

    if (!attempt) return res.status(404).json({ error: 'Session not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Session already submitted' })

    const session = getSession(sessionId) || { answeredMap: {}, timeTaken: {} }

    // Fetch correct answers
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, correct_answer')
      .eq('assessment_id', attempt.assessment_id)

    // Calculate score
    let score = 0
    const total = questions?.length || 0
    ;(questions || []).forEach(q => {
      if (session.answeredMap[q.id] && session.answeredMap[q.id] === q.correct_answer) {
        score++
      }
    })

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0

    // Speed flag
    const timeTakenValues = Object.values(session.timeTaken || {})
    const totalTimeTaken = timeTakenValues.reduce((s, t) => s + t, 0)
    const answeredCount = timeTakenValues.length
    const avgTime = answeredCount > 0 ? totalTimeTaken / answeredCount : 0
    const speedFlagged = answeredCount > 0 && avgTime < SPEED_THRESHOLD

    // Violation count
    let violationCount = 0
    try {
      const { count } = await supabaseAdmin
        .from('violations')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', sessionId)
      violationCount = count || 0
    } catch (e) { violationCount = 0 }

    const status = submission_reason ? 'auto_submitted' : 'submitted'

    const answersArray = (session.shuffledIds || []).map(qid => ({
      question_id: qid,
      selected: session.answeredMap[qid] || null,
    }))

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        answers: answersArray,
        score,
        total,
        percentage,
        status,
        submission_reason: submission_reason || 'Manual submission',
        violation_count: violationCount,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .maybeSingle()

    if (updateErr) return res.status(400).json({ error: updateErr.message })

    // Save result
    const resultStatus = percentage >= 50 ? 'passed' : 'failed'
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
        duration: '',
      })
    } catch (e) { /* non-fatal */ }

    // Update profile scores
    try {
      const { data: catResults } = await supabaseAdmin
        .from('results')
        .select('percentage')
        .eq('user_id', attempt.user_id)
        .eq('category', resultCategory)

      const catAvg = catResults?.length > 0
        ? Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length)
        : percentage

      const scoreColumn = resultCategory.toLowerCase() === 'aptitude' ? 'aptitude_score'
        : resultCategory.toLowerCase() === 'coding' ? 'coding_score'
        : resultCategory.toLowerCase() === 'communication' ? 'communication_score'
        : null

      const updateObj = {}
      if (scoreColumn) updateObj[scoreColumn] = catAvg

      const { count: totalSolved } = await supabaseAdmin
        .from('results')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', attempt.user_id)
      updateObj.total_problems_solved = totalSolved || 0

      await supabaseAdmin.from('profiles').update(updateObj).eq('id', attempt.user_id)
    } catch (e) { /* non-fatal */ }

    // Cleanup session memory
    sessionStore.delete(sessionId)

    res.json({
      score,
      total,
      percentage,
      status: resultStatus,
      speedFlagged,
      avgTimePerQuestion: Math.round(avgTime * 100) / 100,
      violationCount,
      attempt: updated,
    })
  } catch (err) {
    console.error('Submit session error:', err)
    res.status(500).json({ error: 'Failed to submit session' })
  }
})

export default router
