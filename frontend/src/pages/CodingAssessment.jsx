import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Clock, ChevronLeft, ChevronRight, Play, Send, CheckCircle2, XCircle,
  AlertTriangle, Shield, Zap, Loader2, Lock, Code2, Terminal
} from 'lucide-react'
import api from '../services/api'
import StrictModeWrapper from '../components/StrictModeWrapper'
import FullscreenHandler from '../components/FullscreenHandler'
import TabSwitchDetector from '../components/TabSwitchDetector'
import ViolationTracker from '../components/ViolationTracker'
import SecureCodeEditor from '../components/SecureCodeEditor'

const MAX_SUBMISSIONS = 3

const LANG_TEMPLATES = {
  javascript: '// Write your solution here\n\nfunction solve(input) {\n  // Parse input and return output\n  \n}\n',
  python: '# Write your solution here\n\ndef solve(input_str):\n    # Parse input and return output\n    pass\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Read input, write output\n    \n    return 0;\n}\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Read input, write output\n        \n    }\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    // Read input, write output\n    \n    return 0;\n}\n',
}

export default function CodingAssessment() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Session state
  const [sessionId, setSessionId] = useState(null)
  const [assessmentTitle, setAssessmentTitle] = useState('')
  const [assessmentCategory, setAssessmentCategory] = useState('')
  const [problems, setProblems] = useState([])
  const [submissionInfo, setSubmissionInfo] = useState({})

  // Editor state
  const [currentIdx, setCurrentIdx] = useState(0)
  const [codeMap, setCodeMap] = useState({}) // problemId -> code
  const [language, setLanguage] = useState('javascript')

  // Execution state
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState(null)
  const [submittingCode, setSubmittingCode] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)

  // Timer
  const [timeLeft, setTimeLeft] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const timerRef = useRef(null)
  const problemStartTime = useRef(Date.now())
  const [activeTab, setActiveTab] = useState('problem') // problem | output | submissions

  // ─── Initialize Session ───────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const { data } = await api.post('/coding/session/start', { assessment_id: id })
        setSessionId(data.sessionId)
        setAssessmentTitle(data.title)
        setAssessmentCategory(data.category)

        const durationMatch = data.duration?.match(/(\d+)/)
        const minutes = durationMatch ? parseInt(durationMatch[1]) : 90
        setTimeLeft(minutes * 60)

        // Load problems
        const probRes = await api.get(`/coding/session/${data.sessionId}/problems`)
        setProblems(probRes.data.problems || [])
        setSubmissionInfo(probRes.data.submissionInfo || {})

        // Initialize code map with templates
        const codeInit = {}
        ;(probRes.data.problems || []).forEach(p => {
          codeInit[p.id] = p.code_template || LANG_TEMPLATES.javascript
        })
        setCodeMap(codeInit)
      } catch (err) {
        console.error('Init error:', err)
        const msg = err.response?.data?.error || err.message || 'Unknown error'
        alert(`Failed to load coding assessment: ${msg}`)
        navigate('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [id, navigate])

  // ─── Global Timer ─────────────────────────────────────────
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

  // Track time per problem
  useEffect(() => {
    problemStartTime.current = Date.now()
    setRunOutput(null)
    setSubmitResult(null)
  }, [currentIdx])

  // ─── Helpers ──────────────────────────────────────────────
  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const getTimeTaken = () => Math.round((Date.now() - problemStartTime.current) / 1000)

  const currentProblem = problems[currentIdx]
  const currentCode = currentProblem ? (codeMap[currentProblem.id] || '') : ''
  const currentSubs = currentProblem ? (submissionInfo[currentProblem.id] || []) : []
  const subsRemaining = MAX_SUBMISSIONS - currentSubs.length
  const bestSub = currentSubs.reduce((best, s) => (!best || s.score > best.score) ? s : best, null)

  const updateCode = (val) => {
    if (!currentProblem) return
    setCodeMap(prev => ({ ...prev, [currentProblem.id]: val }))
  }

  const updateLanguage = (lang) => {
    setLanguage(lang)
    // Update code template if current is still default
    if (currentProblem) {
      const currentTemplate = LANG_TEMPLATES[language] || ''
      const newTemplate = LANG_TEMPLATES[lang] || ''
      if (!codeMap[currentProblem.id] || codeMap[currentProblem.id].trim() === currentTemplate.trim()) {
        setCodeMap(prev => ({ ...prev, [currentProblem.id]: newTemplate }))
      }
    }
  }

  // ─── Run Code (no submission, just execute) ───────────────
  const handleRunCode = async () => {
    if (running || !currentProblem) return
    setRunning(true)
    setRunOutput(null)
    setActiveTab('output')

    try {
      const stdin = currentProblem.visible_test_cases?.[0]?.input || ''
      const { data } = await api.post(`/coding/session/${sessionId}/run`, {
        code: currentCode,
        language,
        stdin,
      })
      setRunOutput(data)
    } catch (err) {
      if (err.response?.status === 429) {
        setRunOutput({ error: 'Rate limit reached. Please wait before running again.', status: 'error' })
      } else {
        setRunOutput({ error: err.response?.data?.error || 'Execution failed', status: 'error' })
      }
    } finally {
      setRunning(false)
    }
  }

  // ─── Submit Code (scored against all test cases) ──────────
  const handleSubmitCode = async () => {
    if (submittingCode || !currentProblem || subsRemaining <= 0) return
    setSubmittingCode(true)
    setSubmitResult(null)
    setActiveTab('output')

    try {
      const { data } = await api.post(`/coding/session/${sessionId}/submit`, {
        question_id: currentProblem.id,
        code: currentCode,
        language,
        time_taken: getTimeTaken(),
      })

      setSubmitResult(data)

      // Update submission info
      setSubmissionInfo(prev => ({
        ...prev,
        [currentProblem.id]: [
          ...(prev[currentProblem.id] || []),
          { id: data.submission_id, passed_tests: data.passed_tests, total_tests: data.total_tests, score: data.score, status: data.status }
        ]
      }))
    } catch (err) {
      if (err.response?.status === 429) {
        setSubmitResult({ error: 'Maximum submissions reached for this problem' })
      } else {
        setSubmitResult({ error: err.response?.data?.error || 'Submission failed' })
      }
    } finally {
      setSubmittingCode(false)
    }
  }

  // ─── Finalize Assessment ──────────────────────────────────
  const handleFinalize = async (reason = null) => {
    if (submitting || submitted) return
    setSubmitting(true)
    try {
      clearInterval(timerRef.current)
      const { data } = await api.post(`/coding/session/${sessionId}/finalize`, {
        submission_reason: reason,
      })
      setResult(data)
      setSubmitted(true)
    } catch (err) {
      console.error('Finalize error:', err)
      alert('Failed to submit assessment')
    }
    setSubmitting(false)
  }

  const handleAutoSubmit = useCallback((reason) => {
    handleFinalize(reason)
  }, [sessionId])

  // ─── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1e1e2e] flex items-center justify-center z-[100]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#2a2a40] flex items-center justify-center mx-auto mb-4">
            <Code2 size={28} className="text-[#22c55e] animate-pulse" />
          </div>
          <p className="text-sm font-medium text-[#e4e4e7] mb-1">Initializing Coding Environment</p>
          <p className="text-xs text-[#888]">Setting up secure sandbox...</p>
        </div>
      </div>
    )
  }

  // ─── Results Screen ───────────────────────────────────────
  if (submitted && result) {
    return (
      <div className="fixed inset-0 bg-[#1e1e2e] flex items-center justify-center z-[100] p-4">
        <div className="bg-[#1a1a2e] rounded-2xl p-8 max-w-lg w-full animate-fade-in border border-[#2a2a40]">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 ${
            result.status === 'passed' ? 'bg-[#22c55e]/10' : 'bg-error/10'
          }`}>
            {result.status === 'passed' ? (
              <CheckCircle2 size={36} className="text-[#22c55e]" />
            ) : (
              <AlertTriangle size={36} className="text-error" />
            )}
          </div>

          <h2 className="text-2xl font-bold text-[#e4e4e7] text-center mb-2">
            {result.status === 'passed' ? 'Excellent Work!' : 'Assessment Complete'}
          </h2>
          <p className="text-sm text-[#888] text-center mb-6">
            {result.attempt?.submission_reason || 'Manual submission'}
          </p>

          {/* Score Summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[#242438] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#e4e4e7]">{result.score}</p>
              <p className="text-[10px] text-[#888] uppercase tracking-wider">Problems Solved</p>
            </div>
            <div className="bg-[#242438] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#e4e4e7]">{result.total}</p>
              <p className="text-[10px] text-[#888] uppercase tracking-wider">Total</p>
            </div>
            <div className="bg-[#242438] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#22c55e]">{result.percentage}%</p>
              <p className="text-[10px] text-[#888] uppercase tracking-wider">Avg Score</p>
            </div>
          </div>

          {/* Per-problem breakdown */}
          {result.problemResults && result.problemResults.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888] mb-3">Problem Breakdown</h4>
              {result.problemResults.map((pr, i) => (
                <div key={i} className="flex items-center justify-between bg-[#242438] rounded-lg px-4 py-2.5 mb-2">
                  <span className="text-xs text-[#e4e4e7] font-medium">Problem {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#888]">{pr.passed_tests}/{pr.total_tests} tests</span>
                    <span className={`text-xs font-bold ${pr.score >= 50 ? 'text-[#22c55e]' : 'text-error'}`}>
                      {pr.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Flags */}
          {result.speedFlagged && (
            <div className="bg-[#fef3c7]/10 rounded-lg px-4 py-2 mb-3 text-xs text-[#fbbf24] flex items-center gap-2">
              <Zap size={14} /> Unusual submission speed detected
            </div>
          )}
          {result.plagiarismFlagged && (
            <div className="bg-error/10 rounded-lg px-4 py-2 mb-3 text-xs text-error flex items-center gap-2">
              <AlertTriangle size={14} /> Potential code similarity detected
            </div>
          )}
          {result.violationCount > 0 && (
            <div className="bg-error/10 rounded-lg px-4 py-2 mb-3 text-xs text-error">
              {result.violationCount} violation(s) recorded
            </div>
          )}

          <button onClick={() => navigate('/dashboard')}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[#22c55e] text-white hover:bg-[#16a34a] transition-colors mt-2">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ─── Main Coding UI ───────────────────────────────────────
  const isLowTime = timeLeft < 120

  return (
    <ViolationTracker attemptId={sessionId} onAutoSubmit={handleAutoSubmit}>
      {({ logViolation }) => (
        <StrictModeWrapper enabled onViolation={logViolation}>
          <FullscreenHandler enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />
          <TabSwitchDetector enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />

          <div className="fixed inset-0 bg-[#1e1e2e] z-[100] flex flex-col">
            {/* ─── Top Bar ─── */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#191929] border-b border-[#2a2a40]">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                  <h1 className="text-sm font-semibold text-[#e4e4e7]">{assessmentTitle}</h1>
                </div>
                <span className="text-[10px] text-[#888] bg-[#2a2a40] px-2 py-0.5 rounded">
                  Problem {currentIdx + 1} / {problems.length}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-[#888]">
                  <Shield size={10} /> Secure Mode
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Timer */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
                  isLowTime ? 'bg-error/20 text-error animate-pulse' : 'bg-[#2a2a40] text-[#e4e4e7]'
                }`}>
                  <Clock size={13} />
                  {formatTime(timeLeft)}
                </div>

                {/* Language Selector */}
                <select value={language} onChange={(e) => updateLanguage(e.target.value)}
                  className="bg-[#2a2a40] text-[#e4e4e7] text-xs px-3 py-1.5 rounded-lg border-0 outline-none cursor-pointer">
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                  <option value="c">C</option>
                </select>

                {/* Submit All */}
                <button onClick={() => setShowConfirm(true)}
                  className="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/90 transition-colors">
                  <Send size={12} /> Finish
                </button>
              </div>
            </div>

            {/* ─── Split Layout ─── */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Panel — Problem + Output Tabs */}
              <div className="w-2/5 border-r border-[#2a2a40] flex flex-col bg-[#1a1a2e]">
                {/* Tab Bar */}
                <div className="flex border-b border-[#2a2a40]">
                  {[
                    { key: 'problem', label: 'Problem', icon: Code2 },
                    { key: 'output', label: 'Output', icon: Terminal },
                  ].map(tab => (
                    <button key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                        activeTab === tab.key
                          ? 'text-[#e4e4e7] border-b-2 border-[#22c55e] bg-[#1e1e2e]'
                          : 'text-[#888] hover:text-[#e4e4e7]'
                      }`}>
                      <tab.icon size={12} /> {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-5">
                  {/* Problem Tab */}
                  {activeTab === 'problem' && currentProblem && (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          currentProblem.difficulty === 'Easy' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
                          currentProblem.difficulty === 'Hard' ? 'bg-error/10 text-error' :
                          'bg-[#fbbf24]/10 text-[#fbbf24]'
                        }`}>
                          {currentProblem.difficulty}
                        </span>
                        {bestSub && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            bestSub.status === 'accepted' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#fbbf24]/10 text-[#fbbf24]'
                          }`}>
                            Best: {bestSub.score}%
                          </span>
                        )}
                        <span className="text-[10px] text-[#888]">
                          {subsRemaining}/{MAX_SUBMISSIONS} submissions left
                        </span>
                      </div>

                      <h2 className="text-base font-semibold text-[#e4e4e7] mb-4 leading-relaxed">
                        {currentProblem.question_text}
                      </h2>

                      {/* Constraints */}
                      {currentProblem.constraints && (
                        <div className="mb-4">
                          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#888] mb-2">Constraints</h3>
                          <div className="bg-[#242438] rounded-lg p-3 text-xs text-[#e4e4e7] font-mono whitespace-pre-wrap">
                            {currentProblem.constraints}
                          </div>
                        </div>
                      )}

                      {/* Input/Output Format */}
                      {currentProblem.input_format && (
                        <div className="mb-4">
                          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#888] mb-2">Input Format</h3>
                          <div className="bg-[#242438] rounded-lg p-3 text-xs text-[#e4e4e7] font-mono whitespace-pre-wrap">
                            {currentProblem.input_format}
                          </div>
                        </div>
                      )}

                      {currentProblem.output_format && (
                        <div className="mb-4">
                          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#888] mb-2">Output Format</h3>
                          <div className="bg-[#242438] rounded-lg p-3 text-xs text-[#e4e4e7] font-mono whitespace-pre-wrap">
                            {currentProblem.output_format}
                          </div>
                        </div>
                      )}

                      {/* Visible Test Cases */}
                      {currentProblem.visible_test_cases?.length > 0 && (
                        <div className="mb-4">
                          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#888] mb-2">
                            Sample Test Cases ({currentProblem.visible_test_cases.length} of {currentProblem.total_test_cases})
                          </h3>
                          {currentProblem.visible_test_cases.map((tc, i) => (
                            <div key={i} className="bg-[#242438] rounded-lg p-3 mb-2">
                              <div className="text-[10px] text-[#888] mb-1">Input:</div>
                              <code className="text-xs text-[#e4e4e7] font-mono block mb-2 whitespace-pre-wrap">{tc.input}</code>
                              <div className="text-[10px] text-[#888] mb-1">Expected Output:</div>
                              <code className="text-xs text-[#22c55e] font-mono block whitespace-pre-wrap">{tc.expected}</code>
                            </div>
                          ))}
                          {currentProblem.total_test_cases > currentProblem.visible_test_cases.length && (
                            <div className="flex items-center gap-1.5 text-[10px] text-[#888] mt-2">
                              <Lock size={10} />
                              {currentProblem.total_test_cases - currentProblem.visible_test_cases.length} hidden test case(s)
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Output Tab */}
                  {activeTab === 'output' && (
                    <div>
                      {/* Run Output */}
                      {runOutput && !submitResult && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888] mb-3">Execution Result</h4>
                          <div className={`rounded-lg p-3 mb-3 text-xs font-mono ${
                            runOutput.error ? 'bg-error/10 text-error' :
                            runOutput.status === 'Accepted' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
                            'bg-[#fbbf24]/10 text-[#fbbf24]'
                          }`}>
                            Status: {runOutput.status || runOutput.error}
                          </div>
                          {runOutput.stdout && (
                            <div className="mb-3">
                              <div className="text-[10px] text-[#888] mb-1">stdout:</div>
                              <pre className="bg-[#242438] rounded-lg p-3 text-xs text-[#e4e4e7] font-mono whitespace-pre-wrap overflow-x-auto">{runOutput.stdout}</pre>
                            </div>
                          )}
                          {runOutput.stderr && (
                            <div className="mb-3">
                              <div className="text-[10px] text-[#888] mb-1">stderr:</div>
                              <pre className="bg-[#242438] rounded-lg p-3 text-xs text-error font-mono whitespace-pre-wrap overflow-x-auto">{runOutput.stderr}</pre>
                            </div>
                          )}
                          {runOutput.compile_output && (
                            <div className="mb-3">
                              <div className="text-[10px] text-[#888] mb-1">Compile Output:</div>
                              <pre className="bg-[#242438] rounded-lg p-3 text-xs text-[#fbbf24] font-mono whitespace-pre-wrap overflow-x-auto">{runOutput.compile_output}</pre>
                            </div>
                          )}
                          {runOutput.time && (
                            <div className="flex gap-4 text-[10px] text-[#888]">
                              <span>Time: {runOutput.time}s</span>
                              {runOutput.memory && <span>Memory: {Math.round(runOutput.memory / 1024)}KB</span>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Submit Result */}
                      {submitResult && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888] mb-3">Submission Result</h4>

                          {submitResult.error ? (
                            <div className="bg-error/10 text-error rounded-lg p-3 text-xs">{submitResult.error}</div>
                          ) : (
                            <>
                              <div className={`rounded-xl p-4 mb-4 ${
                                submitResult.status === 'accepted' ? 'bg-[#22c55e]/10 border border-[#22c55e]/30' : 'bg-[#fbbf24]/10 border border-[#fbbf24]/30'
                              }`}>
                                <div className="flex items-center gap-2 mb-2">
                                  {submitResult.status === 'accepted' ? (
                                    <CheckCircle2 size={16} className="text-[#22c55e]" />
                                  ) : (
                                    <AlertTriangle size={16} className="text-[#fbbf24]" />
                                  )}
                                  <span className={`text-sm font-bold ${
                                    submitResult.status === 'accepted' ? 'text-[#22c55e]' : 'text-[#fbbf24]'
                                  }`}>
                                    {submitResult.status === 'accepted' ? 'All Tests Passed!' : 'Partial Solution'}
                                  </span>
                                </div>
                                <p className="text-xs text-[#888]">
                                  {submitResult.passed_tests}/{submitResult.total_tests} test cases passed • Score: {submitResult.score}%
                                </p>
                                {submitResult.remaining_submissions >= 0 && (
                                  <p className="text-[10px] text-[#888] mt-1">
                                    {submitResult.remaining_submissions} submission(s) remaining
                                  </p>
                                )}
                              </div>

                              {/* Test case results */}
                              {submitResult.test_results?.map((tr, i) => (
                                <div key={i} className={`flex items-start gap-2 text-xs font-mono p-2.5 rounded-lg mb-1.5 ${
                                  tr.passed ? 'bg-[#22c55e]/5 text-[#22c55e]' : 'bg-error/5 text-error'
                                }`}>
                                  {tr.passed ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <XCircle size={13} className="shrink-0 mt-0.5" />}
                                  <div className="flex-1">
                                    <span className="font-semibold">Test {i + 1}</span>
                                    {tr.isHidden ? (
                                      <span className="text-[#888] ml-2 font-sans">(Hidden)</span>
                                    ) : (
                                      <div className="mt-1 text-[#888] font-sans text-[10px]">
                                        {tr.input && <div>Input: <code className="text-[#e4e4e7]">{tr.input}</code></div>}
                                        {tr.expected && <div>Expected: <code className="text-[#22c55e]">{tr.expected}</code></div>}
                                        {tr.actual !== undefined && <div>Got: <code className={tr.passed ? 'text-[#22c55e]' : 'text-error'}>{tr.actual}</code></div>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {submitResult.speed_flagged && (
                                <div className="bg-[#fbbf24]/10 rounded-lg p-2 mt-3 text-[10px] text-[#fbbf24] flex items-center gap-1.5">
                                  <Zap size={10} /> Submission speed flagged
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {!runOutput && !submitResult && (
                        <div className="text-center py-12">
                          <Terminal size={32} className="text-[#555] mx-auto mb-3" />
                          <p className="text-xs text-[#555]">Run or submit your code to see output here</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Problem Navigation */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#2a2a40]">
                  <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
                    className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e4e4e7] disabled:opacity-30 transition-colors">
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <div className="flex gap-1.5">
                    {problems.map((p, i) => {
                      const subs = submissionInfo[p.id] || []
                      const best = subs.reduce((b, s) => (!b || s.score > b.score) ? s : b, null)
                      return (
                        <button key={i} onClick={() => setCurrentIdx(i)}
                          className={`w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                            i === currentIdx ? 'bg-[#22c55e] text-white scale-110' :
                            best?.status === 'accepted' ? 'bg-[#22c55e]/20 text-[#22c55e]' :
                            best ? 'bg-[#fbbf24]/20 text-[#fbbf24]' :
                            'bg-[#2a2a40] text-[#888] hover:bg-[#3a3a50]'
                          }`}>
                          {i + 1}
                        </button>
                      )
                    })}
                  </div>
                  <button onClick={() => setCurrentIdx(Math.min(problems.length - 1, currentIdx + 1))} disabled={currentIdx === problems.length - 1}
                    className="flex items-center gap-1 text-xs text-[#888] hover:text-[#e4e4e7] disabled:opacity-30 transition-colors">
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Right Panel — Code Editor */}
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-hidden">
                  <SecureCodeEditor
                    value={currentCode}
                    onChange={updateCode}
                    language={language}
                    onViolation={logViolation}
                  />
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#191929] border-t border-[#2a2a40]">
                  <div className="flex items-center gap-2 text-[10px] text-[#888]">
                    <span>{currentCode.split('\n').length} lines</span>
                    <span>•</span>
                    <span>{subsRemaining} submissions remaining</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleRunCode} disabled={running}
                      className="flex items-center gap-1.5 text-xs font-medium bg-[#22c55e] text-white px-4 py-2 rounded-lg hover:bg-[#16a34a] disabled:opacity-50 transition-colors">
                      {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      {running ? 'Running...' : 'Run Code'}
                    </button>
                    <button onClick={handleSubmitCode} disabled={submittingCode || subsRemaining <= 0}
                      className="flex items-center gap-1.5 text-xs font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                      {submittingCode ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {submittingCode ? 'Submitting...' : `Submit (${subsRemaining} left)`}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Confirm Finalize Modal ─── */}
            {showConfirm && (
              <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
                <div className="bg-[#1a1a2e] rounded-2xl p-8 max-w-sm w-full animate-fade-in border border-[#2a2a40]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#22c55e]/10 flex items-center justify-center">
                      <Shield size={20} className="text-[#22c55e]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#e4e4e7]">Finish Assessment?</h3>
                  </div>

                  <p className="text-sm text-[#888] mb-4">
                    Your best submission for each problem will be used for scoring.
                  </p>

                  {/* Problems status summary */}
                  <div className="bg-[#242438] rounded-lg p-3 mb-5">
                    {problems.map((p, i) => {
                      const subs = submissionInfo[p.id] || []
                      const best = subs.reduce((b, s) => (!b || s.score > b.score) ? s : b, null)
                      return (
                        <div key={i} className="flex items-center justify-between py-1.5">
                          <span className="text-xs text-[#e4e4e7]">Problem {i + 1}</span>
                          <span className={`text-xs font-bold ${
                            !best ? 'text-[#555]' : best.status === 'accepted' ? 'text-[#22c55e]' : 'text-[#fbbf24]'
                          }`}>
                            {!best ? 'Not submitted' : `${best.score}%`}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setShowConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2a2a40] text-[#888] hover:text-[#e4e4e7] hover:bg-[#3a3a50] transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => { setShowConfirm(false); handleFinalize() }} disabled={submitting}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#22c55e] text-white hover:bg-[#16a34a] disabled:opacity-60 transition-colors">
                      {submitting ? 'Finalizing...' : 'Confirm Finish'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </StrictModeWrapper>
      )}
    </ViolationTracker>
  )
}
