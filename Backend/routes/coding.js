import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { rateLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(authenticate)

// ─── Code Execution Config ─────────────────────────────────
const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com'
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || ''
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com'

const MAX_SUBMISSIONS_PER_PROBLEM = 3
const SPEED_FLAG_THRESHOLD = 60

const LANG_MAP = {
  javascript: { id: 63, name: 'JavaScript (Node.js 12.14.0)', template: '// Write your solution here\n\n' },
  python: { id: 71, name: 'Python (3.8.1)', template: '# Write your solution here\n\n' },
  cpp: { id: 54, name: 'C++ (GCC 9.2.0)', template: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n' },
  java: { id: 62, name: 'Java (OpenJDK 13.0.1)', template: 'public class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n' },
  c: { id: 50, name: 'C (GCC 9.2.0)', template: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n' },
}

// ─── Ensure code_submissions table exists ───────────────────
let tableChecked = false
async function ensureTable() {
  if (tableChecked) return
  try {
    // Try a simple query — if it fails, create the table
    const { error } = await supabaseAdmin.from('code_submissions').select('id').limit(1)
    if (error && error.message.includes('does not exist')) {
      console.log('Creating code_submissions table...')
      try {
        await supabaseAdmin.rpc('exec_sql', {
          sql: `CREATE TABLE IF NOT EXISTS code_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
            question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
            user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'javascript',
            passed_tests INTEGER DEFAULT 0,
            total_tests INTEGER DEFAULT 0,
            score INTEGER DEFAULT 0,
            time_taken INTEGER DEFAULT 0,
            speed_flagged BOOLEAN DEFAULT false,
            status TEXT DEFAULT 'pending',
            execution_results JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );`
        })
      } catch {
        console.log('Note: Run migration_v5.sql in Supabase SQL Editor to create code_submissions table')
      }
    }
    tableChecked = true
  } catch (e) {
    // Ignore — table might not exist yet
    tableChecked = true
  }
}

/** Safe query to code_submissions — returns empty array if table doesn't exist */
async function safeQuerySubmissions(query) {
  try {
    const result = await query
    if (result.error && result.error.message.includes('does not exist')) {
      return { data: [], count: 0 }
    }
    return result
  } catch {
    return { data: [], count: 0 }
  }
}

// ─── Helpers ────────────────────────────────────────────────

/** Execute code via Judge0 API (sandboxed) */
async function executeCode(sourceCode, languageId, stdin = '', timeLimit = 5, memoryLimit = 128000) {
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (JUDGE0_API_KEY) {
      headers['X-RapidAPI-Key'] = JUDGE0_API_KEY
      headers['X-RapidAPI-Host'] = JUDGE0_API_HOST
    }

    const submitRes = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_code: Buffer.from(sourceCode).toString('base64'),
        language_id: languageId,
        stdin: Buffer.from(stdin).toString('base64'),
        cpu_time_limit: timeLimit,
        memory_limit: memoryLimit,
        wall_time_limit: timeLimit * 2,
      }),
    })

    if (!submitRes.ok) {
      const errText = await submitRes.text()
      console.error('Judge0 error:', submitRes.status, errText)
      return { error: `Execution service error (${submitRes.status})`, stdout: '', stderr: errText, status: 'error' }
    }

    const result = await submitRes.json()
    return {
      stdout: result.stdout ? Buffer.from(result.stdout, 'base64').toString() : '',
      stderr: result.stderr ? Buffer.from(result.stderr, 'base64').toString() : '',
      compile_output: result.compile_output ? Buffer.from(result.compile_output, 'base64').toString() : '',
      status: result.status?.description || 'Unknown',
      status_id: result.status?.id || 0,
      time: result.time || '0',
      memory: result.memory || 0,
      error: null,
    }
  } catch (err) {
    console.error('Code execution error:', err)
    return { error: err.message, stdout: '', stderr: '', status: 'error' }
  }
}

/** Fallback: Execute JavaScript in Node.js (limited) */
async function executeFallback(sourceCode, language, stdin = '') {
  if (language !== 'javascript') {
    return {
      error: 'Code execution service not configured. Set JUDGE0_API_KEY in .env for multi-language support. Only JavaScript fallback available.',
      stdout: '', stderr: '', status: 'error'
    }
  }
  try {
    const fn = new Function('input', `${sourceCode}\nif (typeof solve === 'function') return solve(input); return '';`)
    const output = fn(stdin)
    return { stdout: String(output), stderr: '', status: 'Accepted', error: null, time: '0', memory: 0 }
  } catch (runErr) {
    return { stdout: '', stderr: runErr.message, status: 'Runtime Error', error: null, time: '0', memory: 0 }
  }
}

/** Run code with appropriate execution method */
async function runCode(sourceCode, language, stdin = '') {
  const langInfo = LANG_MAP[language]
  if (!langInfo) return { error: `Unsupported language: ${language}`, stdout: '', stderr: '', status: 'error' }
  if (JUDGE0_API_KEY || JUDGE0_API_URL.includes('localhost')) {
    return executeCode(sourceCode, langInfo.id, stdin)
  }
  return executeFallback(sourceCode, language, stdin)
}

function normalizeOutput(str) {
  return (str || '').trim().replace(/\r\n/g, '\n').replace(/\s+$/gm, '')
}

function normalizeCode(code) {
  return (code || '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ─── POST /session/start — Start or resume coding session ───
router.post('/session/start', async (req, res) => {
  try {
    const { assessment_id } = req.body
    if (!assessment_id) return res.status(400).json({ error: 'assessment_id is required' })

    const { data: assessment, error: assessErr } = await supabaseAdmin
      .from('assessments')
      .select('*')
      .eq('id', assessment_id)
      .maybeSingle()

    if (assessErr) {
      console.error('Assessment fetch error:', assessErr)
      return res.status(500).json({ error: 'Failed to fetch assessment: ' + assessErr.message })
    }
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' })
    if (assessment.status !== 'available') return res.status(400).json({ error: 'Assessment is not available' })

    // Check for existing in-progress attempt
    const { data: existing } = await supabaseAdmin
      .from('attempts')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('assessment_id', assessment_id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (existing) {
      // Try to get submission counts (graceful if table doesn't exist)
      let submissionCounts = {}
      try {
        const { data: subs } = await safeQuerySubmissions(
          supabaseAdmin.from('code_submissions').select('question_id, id').eq('attempt_id', existing.id)
        )
        ;(subs || []).forEach(s => {
          submissionCounts[s.question_id] = (submissionCounts[s.question_id] || 0) + 1
        })
      } catch (e) {
        // Ignore — table may not exist
      }

      return res.json({
        sessionId: existing.id,
        resumed: true,
        title: assessment.title,
        category: assessment.category,
        duration: assessment.duration,
        submissionCounts,
      })
    }

    // Get questions
    const { data: questions, error: qErr } = await supabaseAdmin
      .from('questions')
      .select('id')
      .eq('assessment_id', assessment_id)

    if (qErr) {
      console.error('Questions fetch error:', qErr)
      return res.status(500).json({ error: 'Failed to fetch questions: ' + qErr.message })
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'No coding problems found for this assessment' })
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

    if (createErr) {
      console.error('Attempt create error:', createErr)
      return res.status(500).json({ error: 'Failed to create session: ' + createErr.message })
    }

    res.status(201).json({
      sessionId: attempt.id,
      resumed: false,
      title: assessment.title,
      category: assessment.category,
      duration: assessment.duration,
      submissionCounts: {},
    })
  } catch (err) {
    console.error('Coding session start error:', err)
    res.status(500).json({ error: 'Failed to start session: ' + err.message })
  }
})

// ─── GET /session/:sessionId/problems ───────────────────────
router.get('/session/:sessionId/problems', async (req, res) => {
  try {
    const { sessionId } = req.params

    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, status, assessment_id')
      .eq('id', sessionId)
      .maybeSingle()

    if (!attempt) return res.status(404).json({ error: 'Session not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })

    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, option_a, option_b, option_c, option_d, question_type, difficulty, code_template, test_cases, sort_order')
      .eq('assessment_id', attempt.assessment_id)
      .order('sort_order')

    const problems = (questions || []).map(q => {
      const allTests = q.test_cases || []
      const visibleTests = allTests.slice(0, 2)
      return {
        id: q.id,
        question_text: q.question_text,
        difficulty: q.difficulty || 'Medium',
        code_template: q.code_template || '',
        constraints: q.option_a || '',
        input_format: q.option_b || '',
        output_format: q.option_c || '',
        visible_test_cases: visibleTests,
        total_test_cases: allTests.length,
        sort_order: q.sort_order,
      }
    })

    // Safely query code_submissions
    let submissionInfo = {}
    try {
      const { data: subs } = await safeQuerySubmissions(
        supabaseAdmin.from('code_submissions')
          .select('question_id, id, passed_tests, total_tests, status, score')
          .eq('attempt_id', sessionId)
      )
      ;(subs || []).forEach(s => {
        if (!submissionInfo[s.question_id]) submissionInfo[s.question_id] = []
        submissionInfo[s.question_id].push({
          id: s.id,
          passed_tests: s.passed_tests,
          total_tests: s.total_tests,
          status: s.status,
          score: s.score,
        })
      })
    } catch (e) {
      // Table doesn't exist — that's fine
    }

    res.json({ problems, submissionInfo })
  } catch (err) {
    console.error('Get problems error:', err)
    res.status(500).json({ error: 'Failed to fetch problems' })
  }
})

// ─── POST /session/:sessionId/run — Run code (no submission) ─
router.post(
  '/session/:sessionId/run',
  rateLimiter({ windowMs: 60000, max: 15, message: 'Too many code runs. Please wait.' }),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const { code, language, stdin } = req.body

      if (!code || !language) return res.status(400).json({ error: 'code and language are required' })
      if (!LANG_MAP[language]) return res.status(400).json({ error: `Unsupported language: ${language}` })

      const { data: attempt } = await supabaseAdmin
        .from('attempts')
        .select('id, user_id, status')
        .eq('id', sessionId)
        .maybeSingle()

      if (!attempt) return res.status(404).json({ error: 'Session not found' })
      if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
      if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Session already submitted' })

      const result = await runCode(code, language, stdin || '')

      res.json({
        stdout: result.stdout,
        stderr: result.stderr,
        compile_output: result.compile_output || '',
        status: result.status,
        time: result.time,
        memory: result.memory,
        error: result.error,
      })
    } catch (err) {
      console.error('Run code error:', err)
      res.status(500).json({ error: 'Failed to execute code' })
    }
  }
)

// ─── POST /session/:sessionId/submit — Submit code for a problem ─
router.post(
  '/session/:sessionId/submit',
  rateLimiter({ windowMs: 60000, max: 10, message: 'Too many submissions. Please wait.' }),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const { question_id, code, language, time_taken } = req.body

      if (!question_id || !code || !language) {
        return res.status(400).json({ error: 'question_id, code, and language are required' })
      }

      const { data: attempt } = await supabaseAdmin
        .from('attempts')
        .select('id, user_id, status, assessment_id')
        .eq('id', sessionId)
        .maybeSingle()

      if (!attempt) return res.status(404).json({ error: 'Session not found' })
      if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
      if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Session already submitted' })

      // Check submission limit
      let subCount = 0
      try {
        const result = await safeQuerySubmissions(
          supabaseAdmin.from('code_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('attempt_id', sessionId)
            .eq('question_id', question_id)
        )
        subCount = result.count || 0
      } catch (e) { subCount = 0 }

      if (subCount >= MAX_SUBMISSIONS_PER_PROBLEM) {
        return res.status(429).json({
          error: `Maximum ${MAX_SUBMISSIONS_PER_PROBLEM} submissions per problem reached`,
          remainingSubmissions: 0,
        })
      }

      // Fetch ALL test cases
      const { data: question } = await supabaseAdmin
        .from('questions')
        .select('id, test_cases, correct_answer')
        .eq('id', question_id)
        .maybeSingle()

      if (!question) return res.status(404).json({ error: 'Problem not found' })

      const allTestCases = question.test_cases || []
      let passedTests = 0
      const totalTests = allTestCases.length
      const testResults = []

      // If no test cases, treat as accepted (pure code submission)
      if (totalTests === 0) {
        passedTests = 1
      }

      // Run code against all test cases
      for (let i = 0; i < allTestCases.length; i++) {
        const tc = allTestCases[i]
        const result = await runCode(code, language, tc.input || '')

        if (result.error) {
          testResults.push({ index: i, passed: false, status: 'Error', message: result.error, isHidden: i >= 2 })
          continue
        }

        const actual = normalizeOutput(result.stdout)
        const expected = normalizeOutput(tc.expected)
        const passed = actual === expected
        if (passed) passedTests++

        testResults.push({
          index: i, passed, status: result.status, time: result.time, memory: result.memory,
          isHidden: i >= 2,
          ...(i < 2 ? { input: tc.input, expected: tc.expected, actual: result.stdout?.trim() } : {}),
        })
      }

      const score = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 100
      const allPassed = passedTests === totalTests

      const timeTaken = Math.max(0, parseInt(time_taken) || 0)
      const speedFlagged = timeTaken > 0 && timeTaken < SPEED_FLAG_THRESHOLD

      // Store submission (graceful if table doesn't exist)
      let submissionId = null
      try {
        await ensureTable()
        const { data: submission, error: subErr } = await supabaseAdmin
          .from('code_submissions')
          .insert({
            attempt_id: sessionId,
            question_id,
            user_id: req.user.id,
            code,
            language,
            passed_tests: passedTests,
            total_tests: totalTests || 1,
            score,
            time_taken: timeTaken,
            speed_flagged: speedFlagged,
            status: allPassed ? 'accepted' : 'partial',
            execution_results: testResults,
          })
          .select()
          .maybeSingle()

        if (subErr) {
          console.error('Submission insert error:', subErr.message)
          // Still return results even if storage fails
        } else {
          submissionId = submission?.id
        }
      } catch (e) {
        console.error('Submission storage error (non-fatal):', e.message)
      }

      const remainingSubmissions = MAX_SUBMISSIONS_PER_PROBLEM - subCount - 1

      res.json({
        submission_id: submissionId,
        passed_tests: passedTests,
        total_tests: totalTests || 1,
        score,
        status: allPassed ? 'accepted' : 'partial',
        speed_flagged: speedFlagged,
        remaining_submissions: Math.max(0, remainingSubmissions),
        test_results: testResults.map(t => ({
          index: t.index, passed: t.passed, status: t.status, time: t.time, memory: t.memory,
          isHidden: t.isHidden,
          ...(t.isHidden ? {} : { input: t.input, expected: t.expected, actual: t.actual }),
        })),
      })
    } catch (err) {
      console.error('Submit code error:', err)
      res.status(500).json({ error: 'Failed to submit code' })
    }
  }
)

// ─── POST /session/:sessionId/finalize — Finalize coding assessment ─
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

    // Get best submission for each problem (safe)
    let allSubs = []
    try {
      const result = await safeQuerySubmissions(
        supabaseAdmin.from('code_submissions')
          .select('question_id, score, passed_tests, total_tests, code, speed_flagged')
          .eq('attempt_id', sessionId)
          .order('score', { ascending: false })
      )
      allSubs = result.data || []
    } catch (e) { allSubs = [] }

    const bestPerQuestion = {}
    allSubs.forEach(s => {
      if (!bestPerQuestion[s.question_id] || s.score > bestPerQuestion[s.question_id].score) {
        bestPerQuestion[s.question_id] = s
      }
    })

    const problems = Object.values(bestPerQuestion)
    const totalProblems = attempt.total || problems.length || 1
    const totalScore = problems.reduce((sum, p) => sum + (p.score || 0), 0)
    const avgScore = problems.length > 0 ? Math.round(totalScore / problems.length) : 0
    const anySpeedFlagged = problems.some(p => p.speed_flagged)

    // Plagiarism check
    let plagiarismFlagged = false
    try {
      for (const prob of problems) {
        const normalizedUserCode = normalizeCode(prob.code)
        if (normalizedUserCode.length < 30) continue
        const { data: otherSubs } = await safeQuerySubmissions(
          supabaseAdmin.from('code_submissions')
            .select('user_id, code')
            .eq('question_id', prob.question_id)
            .neq('user_id', attempt.user_id)
            .limit(50)
        )
        for (const other of (otherSubs || [])) {
          if (normalizeCode(other.code) === normalizedUserCode) {
            plagiarismFlagged = true
            break
          }
        }
        if (plagiarismFlagged) break
      }
    } catch (e) { /* non-fatal */ }

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
    const solvedCount = problems.filter(p => (p.score || 0) >= 50).length

    const answersArray = problems.map(p => ({
      question_id: p.question_id || '',
      selected: (p.score || 0) >= 50 ? 'A' : null,
      code: p.code,
      score: p.score,
    }))

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('attempts')
      .update({
        answers: answersArray,
        score: solvedCount,
        total: totalProblems,
        percentage: avgScore,
        status,
        submission_reason: submission_reason || 'Manual submission',
        violation_count: violationCount,
        speed_flagged: anySpeedFlagged,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .maybeSingle()

    if (updateErr) {
      console.error('Update attempt error:', updateErr)
      return res.status(400).json({ error: updateErr.message })
    }

    // Save result
    const resultStatus = avgScore >= 50 ? 'passed' : 'failed'
    const resultCategory = attempt.assessments?.category || 'Coding'
    try {
      await supabaseAdmin.from('results').insert({
        user_id: attempt.user_id,
        assessment_id: attempt.assessment_id,
        assessment_title: attempt.assessments?.title || 'Unknown',
        category: resultCategory,
        score: solvedCount,
        total: totalProblems,
        percentage: avgScore,
        status: resultStatus,
        duration: '',
      })
    } catch (e) { /* non-fatal */ }

    // Update profile
    try {
      const { data: catResults } = await supabaseAdmin
        .from('results')
        .select('percentage')
        .eq('user_id', attempt.user_id)
        .eq('category', resultCategory)

      const catAvg = catResults?.length > 0
        ? Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length)
        : avgScore

      await supabaseAdmin.from('profiles').update({ coding_score: catAvg }).eq('id', attempt.user_id)
    } catch (e) { /* non-fatal */ }

    res.json({
      score: solvedCount,
      total: totalProblems,
      percentage: avgScore,
      status: resultStatus,
      speedFlagged: anySpeedFlagged,
      plagiarismFlagged,
      violationCount,
      problemResults: problems.map(p => ({
        question_id: p.question_id,
        score: p.score,
        passed_tests: p.passed_tests,
        total_tests: p.total_tests,
      })),
      attempt: updated,
    })
  } catch (err) {
    console.error('Finalize coding error:', err)
    res.status(500).json({ error: 'Failed to finalize assessment' })
  }
})

export default router
