import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { rateLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(authenticate)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

const PER_QUESTION_DEFAULT_TIME = 600 // 10 minutes per question default
const PLAGIARISM_SIMILARITY_THRESHOLD = 0.85

// ─── In-memory session store (no extra migration needed) ────
const sessionStore = new Map()

function getSession(id) { return sessionStore.get(id) || null }
function setSession(id, data) {
  sessionStore.set(id, data)
  setTimeout(() => sessionStore.delete(id), 4 * 60 * 60 * 1000) // cleanup after 4h
}

// ─── Gemini AI Evaluation ───────────────────────────────────

async function evaluateWithGemini(questionText, responseText) {
  if (!GEMINI_API_KEY) return null

  const prompt = `You are an expert communication skills assessor. Evaluate the following written response to the given prompt.

PROMPT: "${questionText}"

STUDENT'S RESPONSE:
"""
${responseText}
"""

Evaluate the response on these 4 criteria, each scored 0-25 (total max 100):

1. **Grammar** (0-25): Spelling, punctuation, subject-verb agreement, tense consistency
2. **Clarity** (0-25): How clear and understandable the writing is, logical flow of ideas
3. **Structure** (0-25): Organization, paragraphing, introduction/body/conclusion, proper formatting
4. **Vocabulary** (0-25): Word choice, variety, appropriateness for the context, use of professional language

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{"grammar":15,"clarity":18,"structure":12,"vocabulary":16,"total":61,"feedback":"2-3 sentence constructive feedback about the response, mentioning specific strengths and areas for improvement."}`

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 300,
        },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini API error:', res.status, errText)
      return null
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON from response (handle markdown code blocks if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Gemini returned non-JSON:', text)
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])
    return {
      grammar: Math.min(25, Math.max(0, parseInt(parsed.grammar) || 0)),
      clarity: Math.min(25, Math.max(0, parseInt(parsed.clarity) || 0)),
      structure: Math.min(25, Math.max(0, parseInt(parsed.structure) || 0)),
      vocabulary: Math.min(25, Math.max(0, parseInt(parsed.vocabulary) || 0)),
      total: Math.min(100, Math.max(0, parseInt(parsed.total) || 0)),
      feedback: parsed.feedback || 'No feedback available.',
      source: 'ai',
    }
  } catch (err) {
    console.error('Gemini evaluation error:', err.message)
    return null
  }
}

// ─── Rule-based fallback scoring ────────────────────────────

function evaluateRuleBased(questionText, responseText) {
  if (!responseText || responseText.trim().length === 0) {
    return { grammar: 0, clarity: 0, structure: 0, vocabulary: 0, total: 0, feedback: 'No response provided.', source: 'rule' }
  }

  const text = responseText.trim()
  const words = text.split(/\s+/).filter(w => w)
  const wordCount = words.length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const avgWordLength = words.reduce((s, w) => s + w.length, 0) / Math.max(wordCount, 1)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()))
  const vocabularyRichness = uniqueWords.size / Math.max(wordCount, 1)

  // Grammar (0-25): Based on sentence count, punctuation, capitalization
  const hasProperCapitals = /^[A-Z]/.test(text) && sentences.filter(s => /^\s*[A-Z]/.test(s)).length > 0
  const hasPunctuation = /[.!?,;:]/.test(text)
  const grammar = Math.min(25, Math.round(
    (sentences.length >= 3 ? 10 : sentences.length * 3) +
    (hasProperCapitals ? 5 : 0) +
    (hasPunctuation ? 5 : 0) +
    (wordCount >= 50 ? 5 : (wordCount / 50) * 5)
  ))

  // Clarity (0-25): Based on word count and readability
  const clarity = Math.min(25, Math.round(
    (wordCount >= 100 ? 10 : (wordCount / 100) * 10) +
    (avgWordLength > 3 && avgWordLength < 8 ? 8 : 4) +
    (sentences.length >= 3 && sentences.length <= 20 ? 7 : 3)
  ))

  // Structure (0-25): Based on paragraphs, greeting/closing
  const hasGreeting = /^(dear|hello|hi|greetings|good\s|to\s+whom)/i.test(text)
  const hasClosing = /(regards|sincerely|thank|yours|best|warm)/i.test(text)
  const structure = Math.min(25, Math.round(
    (paragraphs.length >= 2 ? 8 : paragraphs.length * 4) +
    (hasGreeting ? 5 : 0) +
    (hasClosing ? 5 : 0) +
    (sentences.length >= 5 ? 7 : sentences.length * 1.4)
  ))

  // Vocabulary (0-25): Based on unique words and word length variety
  const vocabulary = Math.min(25, Math.round(
    (vocabularyRichness > 0.5 ? 10 : vocabularyRichness * 20) +
    (avgWordLength > 4 ? 8 : avgWordLength * 2) +
    (uniqueWords.size >= 30 ? 7 : (uniqueWords.size / 30) * 7)
  ))

  const total = grammar + clarity + structure + vocabulary

  // Generate feedback
  const feedbackParts = []
  if (wordCount < 50) feedbackParts.push('Try to write more content (aim for 100+ words).')
  if (paragraphs.length < 2) feedbackParts.push('Use multiple paragraphs for better organization.')
  if (!hasGreeting && !hasClosing) feedbackParts.push('Consider adding a proper greeting and closing.')
  if (vocabularyRichness < 0.4) feedbackParts.push('Try to use more varied vocabulary.')
  if (feedbackParts.length === 0) feedbackParts.push('Good effort! Consider refining clarity and structure for a higher score.')

  return {
    grammar, clarity, structure, vocabulary, total,
    feedback: feedbackParts.join(' '),
    source: 'rule',
  }
}

// ─── Plagiarism Detection ───────────────────────────────────

function normalizeForPlagiarism(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function calculateSimilarity(a, b) {
  if (!a || !b) return 0
  const wordsA = new Set(a.split(' '))
  const wordsB = new Set(b.split(' '))
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)))
  const union = new Set([...wordsA, ...wordsB])
  return union.size > 0 ? intersection.size / union.size : 0 // Jaccard similarity
}

// ─── POST /session/start ────────────────────────────────────

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

      // Rebuild session from attempt answers
      const responses = {}
      ;(existing.answers || []).forEach(a => {
        if (a.text_response) responses[a.question_id] = a.text_response
      })
      const session = { responses, timeTaken: {} }
      setSession(existing.id, session)

      return res.json({
        sessionId: existing.id,
        resumed: true,
        totalQuestions: questions?.length || existing.total || 0,
        answeredCount: Object.keys(responses).length,
        duration: assessment.duration,
        perQuestionTime: assessment.per_question_time || PER_QUESTION_DEFAULT_TIME,
        title: assessment.title,
        category: assessment.category,
      })
    }

    // Fetch questions
    const { data: questions, error: qErr } = await supabaseAdmin
      .from('questions')
      .select('id')
      .eq('assessment_id', assessment_id)

    if (qErr) return res.status(500).json({ error: 'Database error: ' + qErr.message })
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No questions found for this assessment' })
    }

    // Create attempt
    const { data: attempt, error: createErr } = await supabaseAdmin
      .from('attempts')
      .insert({
        user_id: req.user.id,
        assessment_id,
        total: questions.length,
        strict_mode_enabled: true,
        status: 'in_progress',
      })
      .select()
      .maybeSingle()

    if (createErr || !attempt) {
      return res.status(500).json({ error: 'Failed to create session: ' + (createErr?.message || 'unknown') })
    }

    setSession(attempt.id, { responses: {}, timeTaken: {} })

    res.status(201).json({
      sessionId: attempt.id,
      resumed: false,
      totalQuestions: questions.length,
      answeredCount: 0,
      duration: assessment.duration,
      perQuestionTime: assessment.per_question_time || PER_QUESTION_DEFAULT_TIME,
      title: assessment.title,
      category: assessment.category,
    })
  } catch (err) {
    console.error('Communication session start error:', err)
    res.status(500).json({ error: 'Failed to start session: ' + err.message })
  }
})

// ─── GET /session/:sessionId/questions ──────────────────────

router.get('/session/:sessionId/questions', async (req, res) => {
  try {
    const { sessionId } = req.params

    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, status, assessment_id')
      .eq('id', sessionId)
      .maybeSingle()

    if (!attempt) return res.status(404).json({ error: 'Session not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })

    // Fetch questions — subjective type, no correct answers sent
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, question_type, difficulty, sort_order')
      .eq('assessment_id', attempt.assessment_id)
      .order('sort_order')

    // Get saved responses from session
    const session = getSession(sessionId)
    const savedResponses = session?.responses || {}

    const prompts = (questions || []).map(q => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type || 'essay',
      difficulty: q.difficulty || 'Intermediate',
      sort_order: q.sort_order,
      saved_response: savedResponses[q.id] || '',
    }))

    res.json({ questions: prompts })
  } catch (err) {
    console.error('Get communication questions error:', err)
    res.status(500).json({ error: 'Failed to fetch questions' })
  }
})

// ─── POST /session/:sessionId/answer — Save response ────────

router.post(
  '/session/:sessionId/answer',
  rateLimiter({ windowMs: 60000, max: 30, message: 'Too many submissions. Please wait.' }),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const { question_id, text_response, time_taken } = req.body

      if (!question_id) return res.status(400).json({ error: 'question_id is required' })

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

      // Save response in session
      session.responses[question_id] = text_response || ''
      session.timeTaken[question_id] = Math.max(0, parseInt(time_taken) || 0)

      // Persist to DB
      const answersArray = Object.entries(session.responses).map(([qid, text]) => ({
        question_id: qid,
        selected: text ? 'A' : null,
        text_response: text,
      }))

      await supabaseAdmin
        .from('attempts')
        .update({ answers: answersArray })
        .eq('id', sessionId)

      res.json({
        accepted: true,
        questionId: question_id,
        wordCount: (text_response || '').trim().split(/\s+/).filter(w => w).length,
        answeredCount: Object.keys(session.responses).filter(k => session.responses[k]?.trim()).length,
      })
    } catch (err) {
      console.error('Save answer error:', err)
      res.status(500).json({ error: 'Failed to save response' })
    }
  }
)

// ─── POST /session/:sessionId/finalize ──────────────────────

router.post('/session/:sessionId/finalize', async (req, res) => {
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

    const session = getSession(sessionId) || { responses: {}, timeTaken: {} }

    // Rebuild responses from attempt if session expired
    if (Object.keys(session.responses).length === 0 && attempt.answers?.length > 0) {
      attempt.answers.forEach(a => {
        if (a.text_response) session.responses[a.question_id] = a.text_response
      })
    }

    // Fetch questions
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text')
      .eq('assessment_id', attempt.assessment_id)

    // ─── AI Evaluation for each response ────────────────────
    const evaluations = {}
    let totalScore = 0
    let evaluatedCount = 0

    for (const q of (questions || [])) {
      const responseText = session.responses[q.id] || ''
      if (!responseText.trim()) {
        evaluations[q.id] = {
          grammar: 0, clarity: 0, structure: 0, vocabulary: 0, total: 0,
          feedback: 'No response was provided for this question.',
          source: 'none',
        }
        continue
      }

      // Try Gemini first, fall back to rule-based
      let evaluation = await evaluateWithGemini(q.question_text, responseText)
      if (!evaluation) {
        evaluation = evaluateRuleBased(q.question_text, responseText)
      }

      evaluations[q.id] = evaluation
      totalScore += evaluation.total
      evaluatedCount++
    }

    const avgScore = evaluatedCount > 0 ? Math.round(totalScore / evaluatedCount) : 0

    // ─── Plagiarism Check ───────────────────────────────────
    let plagiarismFlagged = false
    try {
      for (const q of (questions || [])) {
        const userText = normalizeForPlagiarism(session.responses[q.id])
        if (userText.length < 30) continue

        // Get other users' responses for same assessment + question
        const { data: otherAttempts } = await supabaseAdmin
          .from('attempts')
          .select('answers, user_id')
          .eq('assessment_id', attempt.assessment_id)
          .neq('user_id', attempt.user_id)
          .in('status', ['submitted', 'auto_submitted'])
          .limit(30)

        for (const other of (otherAttempts || [])) {
          const otherAnswer = (other.answers || []).find(a => a.question_id === q.id)
          if (!otherAnswer?.text_response) continue
          const otherText = normalizeForPlagiarism(otherAnswer.text_response)
          if (otherText.length < 30) continue

          const similarity = calculateSimilarity(userText, otherText)
          if (similarity >= PLAGIARISM_SIMILARITY_THRESHOLD) {
            plagiarismFlagged = true
            break
          }
        }
        if (plagiarismFlagged) break
      }
    } catch (e) {
      console.error('Plagiarism check error (non-fatal):', e.message)
    }

    // ─── Violation count ────────────────────────────────────
    let violationCount = 0
    try {
      const { count } = await supabaseAdmin
        .from('violations')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', sessionId)
      violationCount = count || 0
    } catch (e) { violationCount = 0 }

    // ─── Update attempt ─────────────────────────────────────
    const status = submission_reason ? 'auto_submitted' : 'submitted'
    const answeredCount = Object.keys(session.responses).filter(k => session.responses[k]?.trim()).length

    const answersArray = (questions || []).map(q => ({
      question_id: q.id,
      selected: session.responses[q.id]?.trim() ? 'A' : null,
      text_response: session.responses[q.id] || '',
      evaluation: evaluations[q.id] || null,
    }))

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        answers: answersArray,
        score: answeredCount,
        total: questions?.length || 0,
        percentage: avgScore,
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
    const resultStatus = avgScore >= 50 ? 'passed' : 'failed'
    const resultCategory = attempt.assessments?.category || 'Communication'
    try {
      await supabaseAdmin.from('results').insert({
        user_id: attempt.user_id,
        assessment_id: attempt.assessment_id,
        assessment_title: attempt.assessments?.title || 'Unknown',
        category: resultCategory,
        score: answeredCount,
        total: questions?.length || 0,
        percentage: avgScore,
        status: resultStatus,
        duration: '',
      })
    } catch (e) { /* non-fatal */ }

    // Update profile communication score
    try {
      const { data: catResults } = await supabaseAdmin
        .from('results')
        .select('percentage')
        .eq('user_id', attempt.user_id)
        .eq('category', resultCategory)

      const catAvg = catResults?.length > 0
        ? Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length)
        : avgScore

      await supabaseAdmin
        .from('profiles')
        .update({ communication_score: catAvg })
        .eq('id', attempt.user_id)
    } catch (e) { /* non-fatal */ }

    // Cleanup session
    sessionStore.delete(sessionId)

    res.json({
      score: answeredCount,
      total: questions?.length || 0,
      percentage: avgScore,
      status: resultStatus,
      plagiarismFlagged,
      violationCount,
      evaluations,
      attempt: updated,
    })
  } catch (err) {
    console.error('Finalize communication error:', err)
    res.status(500).json({ error: 'Failed to finalize assessment: ' + err.message })
  }
})

export default router
