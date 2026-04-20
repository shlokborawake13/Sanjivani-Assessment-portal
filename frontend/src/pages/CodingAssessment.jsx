import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, ChevronLeft, ChevronRight, Play, Send, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import api from '../services/api'
import StrictModeWrapper from '../components/StrictModeWrapper'
import FullscreenHandler from '../components/FullscreenHandler'
import TabSwitchDetector from '../components/TabSwitchDetector'
import ViolationTracker from '../components/ViolationTracker'
import SecureCodeEditor from '../components/SecureCodeEditor'

export default function CodingAssessment() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [assessment, setAssessment] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [attemptId, setAttemptId] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [codeAnswers, setCodeAnswers] = useState([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [testResults, setTestResults] = useState([])
  const [running, setRunning] = useState(false)
  const [language, setLanguage] = useState('javascript')
  const [submitting, setSubmitting] = useState(false)

  const timerRef = useRef(null)

  useEffect(() => {
    async function init() {
      try {
        const [assessRes, questionsRes] = await Promise.all([
          api.get(`/assessments/${id}`),
          api.get(`/assessments/${id}/questions`)
        ])

        const assess = assessRes.data.assessment
        setAssessment(assess)

        const qs = questionsRes.data.questions || []
        setQuestions(qs)
        setCodeAnswers(qs.map(q => q.code_template || '// Write your solution here\n\n'))

        const durationMatch = assess.duration?.match(/(\d+)/)
        const minutes = durationMatch ? parseInt(durationMatch[1]) : 60
        setTimeLeft(minutes * 60)

        const { data } = await api.post('/attempts', { assessment_id: id })
        setAttemptId(data.attempt.id)
      } catch (err) {
        console.error('Init error:', err)
        navigate('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [id, navigate])

  useEffect(() => {
    if (submitted || timeLeft <= 0 || loading) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          handleAutoSubmit('Timer expired')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [submitted, loading])

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const updateCode = (val) => {
    setCodeAnswers(prev => {
      const updated = [...prev]
      updated[currentIdx] = val
      return updated
    })
  }

  // Client-side test execution (JavaScript only)
  const runTests = () => {
    const q = questions[currentIdx]
    const testCases = q.test_cases || []
    if (testCases.length === 0) {
      setTestResults([{ passed: true, message: 'No test cases defined. Code accepted.' }])
      return
    }

    setRunning(true)
    const results = []

    testCases.forEach((tc, idx) => {
      try {
        // Create sandboxed function
        const userCode = codeAnswers[currentIdx]
        const fn = new Function('input', `${userCode}\nreturn solve(input);`)
        const output = fn(tc.input)
        const passed = String(output).trim() === String(tc.expected).trim()
        results.push({
          passed,
          input: tc.input,
          expected: tc.expected,
          got: String(output),
          message: passed ? `Test ${idx + 1}: Passed` : `Test ${idx + 1}: Expected "${tc.expected}", got "${output}"`
        })
      } catch (err) {
        results.push({ passed: false, input: tc.input, expected: tc.expected, got: 'Error', message: `Test ${idx + 1}: ${err.message}` })
      }
    })

    setTestResults(results)
    setRunning(false)
  }

  const handleSubmit = async (reason = null) => {
    if (submitting || submitted) return
    setSubmitting(true)
    try {
      clearInterval(timerRef.current)
      const answers = questions.map((q, i) => ({ question_id: q.id, selected: codeAnswers[i] ? 'A' : null, code: codeAnswers[i] }))
      const { data } = await api.put(`/attempts/${attemptId}/submit`, { answers, submission_reason: reason })
      setResult(data)
      setSubmitted(true)
    } catch (err) {
      console.error('Submit error:', err)
      alert('Submit failed')
    }
    setSubmitting(false)
  }

  const handleAutoSubmit = useCallback((reason) => {
    handleSubmit(reason)
  }, [attemptId, codeAnswers])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100]">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (submitted && result) {
    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100] p-4">
        <div className="bg-surface-lowest rounded-2xl p-8 max-w-md w-full text-center animate-fade-in" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          <CheckCircle2 size={48} className="text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-on-surface mb-2">Coding Assessment Complete</h2>
          <p className="text-sm text-on-surface-variant mb-6">{result.attempt?.submission_reason || 'Submitted'}</p>
          {result.attempt?.violation_count > 0 && (
            <p className="text-xs text-error mb-4">{result.attempt.violation_count} violation(s) recorded</p>
          )}
          <button onClick={() => navigate('/dashboard')} className="btn-gradient w-full py-3 rounded-xl text-sm font-semibold">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const current = questions[currentIdx]
  const isLowTime = timeLeft < 120

  return (
    <ViolationTracker attemptId={attemptId} onAutoSubmit={handleAutoSubmit}>
      {({ logViolation }) => (
        <StrictModeWrapper enabled onViolation={logViolation}>
          <FullscreenHandler enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />
          <TabSwitchDetector enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />

          <div className="fixed inset-0 bg-[#1e1e2e] z-[100] flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#191929] border-b border-[#2a2a40]">
              <div className="flex items-center gap-4">
                <h1 className="text-sm font-semibold text-[#e4e4e7]">{assessment?.title}</h1>
                <span className="text-[10px] text-[#888] bg-[#2a2a40] px-2 py-0.5 rounded">
                  Problem {currentIdx + 1} / {questions.length}
                </span>
              </div>

              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
                isLowTime ? 'bg-error/20 text-error animate-pulse' : 'bg-[#2a2a40] text-[#e4e4e7]'
              }`}>
                <Clock size={13} />
                {formatTime(timeLeft)}
              </div>

              <div className="flex items-center gap-2">
                <select value={language} onChange={(e) => setLanguage(e.target.value)}
                  className="bg-[#2a2a40] text-[#e4e4e7] text-xs px-3 py-1.5 rounded-lg border-0 outline-none">
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="cpp">C++</option>
                </select>
                <button onClick={() => handleSubmit()} disabled={submitting}
                  className="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/90">
                  <Send size={12} /> Submit All
                </button>
              </div>
            </div>

            {/* Split Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left — Problem Description */}
              <div className="w-2/5 border-r border-[#2a2a40] overflow-y-auto p-6 bg-[#1a1a2e]">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#888] bg-[#2a2a40] px-2.5 py-0.5 rounded-full">
                    {current?.difficulty || 'Medium'}
                  </span>
                </div>

                <h2 className="text-lg font-semibold text-[#e4e4e7] mb-4">{current?.question_text}</h2>

                {current?.test_cases && current.test_cases.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#888] mb-3">Test Cases</h3>
                    {current.test_cases.map((tc, i) => (
                      <div key={i} className="bg-[#242438] rounded-lg p-3 mb-2">
                        <div className="text-[11px] text-[#888] mb-1">Input:</div>
                        <code className="text-xs text-[#e4e4e7] font-mono">{tc.input}</code>
                        <div className="text-[11px] text-[#888] mt-2 mb-1">Expected:</div>
                        <code className="text-xs text-[#22c55e] font-mono">{tc.expected}</code>
                      </div>
                    ))}
                  </div>
                )}

                {/* Question navigation */}
                <div className="flex items-center justify-between mt-8">
                  <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
                    className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e4e4e7] disabled:opacity-30">
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))} disabled={currentIdx === questions.length - 1}
                    className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e4e4e7] disabled:opacity-30">
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Right — Code Editor + Output */}
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-hidden">
                  <SecureCodeEditor
                    value={codeAnswers[currentIdx] || ''}
                    onChange={updateCode}
                    language={language}
                    onViolation={logViolation}
                  />
                </div>

                {/* Test Results */}
                <div className="border-t border-[#2a2a40] bg-[#191929] p-4 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888]">Output</h4>
                    <button onClick={runTests} disabled={running}
                      className="flex items-center gap-1.5 text-xs font-medium bg-[#22c55e] text-white px-3 py-1.5 rounded-lg hover:bg-[#16a34a] disabled:opacity-50">
                      <Play size={12} /> {running ? 'Running...' : 'Run Tests'}
                    </button>
                  </div>

                  {testResults.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {testResults.map((r, i) => (
                        <div key={i} className={`flex items-start gap-2 text-xs font-mono p-2 rounded ${
                          r.passed ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-error/10 text-error'
                        }`}>
                          {r.passed ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
                          <span>{r.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#555] font-mono">Click "Run Tests" to execute your code.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </StrictModeWrapper>
      )}
    </ViolationTracker>
  )
}
