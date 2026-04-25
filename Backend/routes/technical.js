/**
 * Technical Reasoning Assessment Routes
 * 
 * Uses the SAME logic as Aptitude (MCQ, shuffled questions/options, JWT tokens)
 * but is restricted to assessments with assessment_type = 'technical_reasoning'.
 * 
 * This is a thin wrapper — all core logic is identical to aptitude.js
 */
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { rateLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(authenticate)

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me'
const BATCH_SIZE = 5
const SPEED_THRESHOLD = 3

// ─── Helpers (shared with aptitude) ─────────────────────────

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

function signToken(questionId, sessionId) {
  return jwt.sign({ qid: questionId, sid: sessionId }, JWT_SECRET, { expiresIn: '3h' })
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

const sessionStore = new Map()
function getSession(id) { return sessionStore.get(id) || null }
function setSession(id, data) {
  sessionStore.set(id, data)
  setTimeout(() => sessionStore.delete(id), 4 * 60 * 60 * 1000)
}

// ─── POST /session/start ──────────────────────────────────────
router.post('/session/start', async (req, res) => {
  try {
    const { assessment_id } = req.body
    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' })

    const { data: assessment, error: aErr } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .maybeSingle()

    if (aErr) return res.status(500).json({ error: 'Database error: ' + aErr.message })
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })
    if (assessment.status !== 'available') return res.status(400).json({ error: 'Assessment is not available' })

    // Enforce assessment_type
    if (assessment.assessment_type !== 'technical_reasoning') {
      return res.status(400).json({ error: 'This is not a technical reasoning assessment' })
    }

    // Check existing in-progress attempt
    const { data: existing } = await supabaseAdmin
      .from('attempts')
      .select('id, answers, total')
      .eq('user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (existing) {
      const { data: questions } = await supabaseAdmin
        .from('questions').select('id').eq('assessment_id', assessment_id)

      const totalQ = questions?.length || existing.total || 0
      let session = getSession(existing.id)
      if (!session) {
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

    // Fetch questions
    const { data: questions, error: qErr } = await supabaseAdmin
      .from('questions')
      .select('id, option_a, option_b, option_c, option_d')
      .eq('assessment_id', assessment_id)

    if (qErr) return res.status(500).json({ error: 'Database error: ' + qErr.message })
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No questions found' })
    }

    const shuffledIds = shuffle(questions.map(q => q.id))
    const optionMaps = {}
    questions.forEach(q => {
      const { mapping } = shuffleOptions(q)
      optionMaps[q.id] = mapping
    })

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
      return res.status(500).json({ error: 'Failed to create session: ' + (createErr?.message || 'unknown') })
    }

    setSession(attempt.id, { shuffledIds, optionMaps, answeredMap: {}, timeTaken: {} })

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
    console.error('Technical session start error:', err)
    res.status(500).json({ error: 'Failed to start session: ' + err.message })
  }
})

// ─── GET /session/:sessionId/questions ──────────────────────
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
        session = { shuffledIds, optionMaps, answeredMap: {}, timeTaken: {} }
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
          token: signToken(q.id, sessionId),
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

      const decoded = verifyToken(token)
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
      if (!session) return res.status(400).json({ error: 'Session expired' })

      if (session.answeredMap[questionId]) {
        return res.status(409).json({ error: 'Already answered' })
      }

      const qOptionMap = session.optionMaps[questionId] || { A: 'A', B: 'B', C: 'C', D: 'D' }
      const originalOption = qOptionMap[selected_option] || selected_option

      session.answeredMap[questionId] = originalOption
      session.timeTaken[questionId] = Math.max(0, parseInt(time_taken) || 0)

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
      console.error('Answer error:', err)
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
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Already submitted' })

    const session = getSession(sessionId) || { answeredMap: {}, timeTaken: {} }

    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, correct_answer')
      .eq('assessment_id', attempt.assessment_id)

    let score = 0
    const total = questions?.length || 0
    ;(questions || []).forEach(q => {
      if (session.answeredMap[q.id] && session.answeredMap[q.id] === q.correct_answer) score++
    })

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0

    const timeTakenValues = Object.values(session.timeTaken || {})
    const totalTimeTaken = timeTakenValues.reduce((s, t) => s + t, 0)
    const answeredCount = timeTakenValues.length
    const avgTime = answeredCount > 0 ? totalTimeTaken / answeredCount : 0
    const speedFlagged = answeredCount > 0 && avgTime < SPEED_THRESHOLD

    let violationCount = 0
    try {
      const { count } = await supabaseAdmin
        .from('violations')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', sessionId)
      violationCount = count || 0
    } catch { violationCount = 0 }

    const status = submission_reason ? 'auto_submitted' : 'submitted'
    const answersArray = (session.shuffledIds || []).map(qid => ({
      question_id: qid,
      selected: session.answeredMap[qid] || null,
    }))

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        answers: answersArray,
        score, total, percentage, status,
        submission_reason: submission_reason || 'Manual submission',
        violation_count: violationCount,
        speed_flagged: speedFlagged,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .maybeSingle()

    if (updateErr) return res.status(400).json({ error: updateErr.message })

    const resultStatus = percentage >= 50 ? 'passed' : 'failed'
    const resultCategory = attempt.assessments?.category || 'Technical Reasoning'
    try {
      await supabaseAdmin.from('results').insert({
        user_id: attempt.user_id,
        assessment_id: attempt.assessment_id,
        assessment_title: attempt.assessments?.title || 'Unknown',
        category: resultCategory,
        score, total, percentage,
        status: resultStatus,
        duration: ''
      })
    } catch { /* non-fatal */ }

    try {
      const { data: catResults } = await supabaseAdmin
        .from('results')
        .select('percentage')
        .eq('user_id', attempt.user_id)
        .eq('category', resultCategory)

      const catAvg = catResults?.length > 0
        ? Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length)
        : percentage

      await supabaseAdmin.from('profiles')
        .update({ technical_score: catAvg })
        .eq('id', attempt.user_id)
    } catch { /* non-fatal */ }

    sessionStore.delete(sessionId)

    res.json({
      score, total, percentage,
      status: resultStatus,
      speedFlagged,
      avgTimePerQuestion: Math.round(avgTime * 100) / 100,
      violationCount,
      attempt: updated,
    })
  } catch (err) {
    console.error('Submit error:', err)
    res.status(500).json({ error: 'Failed to submit session' })
  }
})

export default router
