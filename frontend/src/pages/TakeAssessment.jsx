import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Save, Send, Shield, ShieldAlert, Eye } from 'lucide-react'
import api from '../services/api'
import ViolationTracker from '../components/ViolationTracker'
import StrictModeWrapper from '../components/StrictModeWrapper'
import ProctoringGate from '../components/ProctoringGate'
import ProctoringHeartbeat from '../components/ProctoringHeartbeat'
import CameraMonitor from '../components/CameraMonitor'
import DebuggerTrap from '../components/DebuggerTrap'
import FullscreenHandler from '../components/FullscreenHandler'

const AUTO_SAVE_INTERVAL = 10_000 // 10 seconds
const STORAGE_KEY = 'assessment_active_attempt'

export default function TakeAssessment() {
  const { id: assessmentId } = useParams()
  const navigate = useNavigate()

  // ─── Core State ───
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exam, setExam] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({}) // { questionId: selectedOption }
  const [currentIndex, setCurrentIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)

  // ─── Timer State ───
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const endTimeRef = useRef(null)

  // ─── Auto-save State ───
  const [saveStatus, setSaveStatus] = useState('idle') // idle, saving, saved, error
  const [lastSaved, setLastSaved] = useState(null)
  const answersRef = useRef({})
  const saveTimeoutRef = useRef(null)

  // ─── Proctoring ───
  const [violationCount, setViolationCount] = useState(0)
  const [autoSubmitting, setAutoSubmitting] = useState(false)
  // Proctoring telemetry state (passed to heartbeat)
  const [cameraActive, setCameraActive] = useState(false)
  const [fullscreenActive, setFullscreenActive] = useState(true)
  const [faceDetected, setFaceDetected] = useState(true)
  const [faceCount, setFaceCount] = useState(1)

  // Keep answersRef in sync
  useEffect(() => { answersRef.current = answers }, [answers])

  // ─── Initialize: Start or Resume Attempt ───
  useEffect(() => {
    initAttempt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  async function initAttempt() {
    try {
      setLoading(true)
      setError(null)

      // Check for active attempt in localStorage
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.assessmentId === assessmentId && parsed.attemptId) {
          // Try to restore
          try {
            const res = await api.get(`/attempts/${parsed.attemptId}/restore`)
            if (res.data.expired) {
              localStorage.removeItem(STORAGE_KEY)
              setSubmitted(true)
              setResult({ status: 'auto_submitted', message: 'Time expired — your answers were auto-submitted.' })
              setLoading(false)
              return
            }
            if (res.data.attempt && res.data.attempt.status === 'in_progress') {
              setupAttempt(res.data.attempt, res.data.questions, res.data.exam, true)
              return
            }
          } catch (e) {
            // Restore failed, try starting fresh
            localStorage.removeItem(STORAGE_KEY)
          }
        }
      }

      // Start new attempt
      const res = await api.post('/attempts', { assessment_id: assessmentId })
      const { attempt: att, questions: qs, exam: examData, resumed } = res.data
      setupAttempt(att, qs, examData, resumed)
    } catch (err) {
      console.error('Init attempt error:', err)
      const msg = err.response?.data?.error || 'Failed to start assessment'
      const data = err.response?.data || {}

      if (data.attempts_used !== undefined) {
        setError(`${msg} (${data.attempts_used}/${data.max_attempts} attempts used)`)
      } else {
        setError(msg)
      }
      setLoading(false)
    }
  }

  function setupAttempt(att, qs, examData, resumed) {
    setAttempt(att)
    setQuestions(qs || [])
    setExam(examData)
    setViolationCount(att.violation_count || 0)

    // Restore answers if resuming
    if (resumed && att.answers && Array.isArray(att.answers)) {
      const restoredAnswers = {}
      att.answers.forEach(a => {
        if (a?.question_id && a?.selected) {
          restoredAnswers[a.question_id] = a.selected
        }
      })
      setAnswers(restoredAnswers)
    }

    // Set end time
    if (att.end_time) {
      endTimeRef.current = new Date(att.end_time)
      const remaining = Math.max(0, Math.floor((endTimeRef.current - new Date()) / 1000))
      setRemainingSeconds(remaining)
    }

    // Store in localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      assessmentId,
      attemptId: att.id
    }))

    setLoading(false)
  }

  // ─── Timer ───
  useEffect(() => {
    if (submitted || !endTimeRef.current) return

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTimeRef.current - new Date()) / 1000))
      setRemainingSeconds(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        handleAutoSubmit('Timer expired')
      }
    }, 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, attempt?.id])

  // ─── Auto-save ───
  useEffect(() => {
    if (submitted || !attempt?.id) return

    const interval = setInterval(() => {
      saveProgress()
    }, AUTO_SAVE_INTERVAL)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, attempt?.id])

  // Save on beforeunload
  useEffect(() => {
    function handleUnload() {
      if (!submitted && attempt?.id) {
        // Use sendBeacon for reliability
        const payload = JSON.stringify({ answers: formatAnswers(answersRef.current) })
        navigator.sendBeacon?.(
          `${api.defaults.baseURL}/attempts/${attempt.id}/save-progress`,
          new Blob([payload], { type: 'application/json' })
        )
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [submitted, attempt?.id])

  // ─── Answer Selection (local only — NO API call) ───
  function selectAnswer(questionId, option) {
    if (submitted) return
    setAnswers(prev => ({ ...prev, [questionId]: option }))
  }

  // ─── Format answers for API ───
  function formatAnswers(ans) {
    return Object.entries(ans).map(([questionId, selected]) => ({
      question_id: questionId,
      selected
    }))
  }

  // ─── Save Progress ───
  const saveProgress = useCallback(async () => {
    if (submitted || !attempt?.id) return
    try {
      setSaveStatus('saving')
      await api.post(`/attempts/${attempt.id}/save-progress`, {
        answers: formatAnswers(answersRef.current)
      })
      setSaveStatus('saved')
      setLastSaved(new Date())
      // Reset to idle after 3s
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('Auto-save error:', err)
      setSaveStatus('error')
      // Check if auto-submitted by server
      if (err.response?.data?.autoSubmitted) {
        setSubmitted(true)
        setResult({ status: 'auto_submitted', message: 'Time expired — your answers were auto-submitted.' })
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [submitted, attempt?.id])

  // ─── Manual Submit ───
  async function handleSubmit() {
    if (submitted || !attempt?.id) return

    const confirmed = window.confirm(
      `Are you sure you want to submit?\n\n` +
      `Questions answered: ${Object.keys(answers).length}/${questions.length}\n` +
      `Unanswered: ${questions.length - Object.keys(answers).length}`
    )
    if (!confirmed) return

    await doSubmit(false, 'Manual submission')
  }

  // ─── Auto-submit (timer or violations) ───
  async function handleAutoSubmit(reason) {
    if (submitted || autoSubmitting) return
    setAutoSubmitting(true)
    await doSubmit(true, reason)
  }

  // ─── Core Submit Logic ───
  async function doSubmit(autoSubmit, reason) {
    try {
      const res = await api.put(`/attempts/${attempt.id}/submit`, {
        answers: formatAnswers(answersRef.current),
        auto_submit: autoSubmit,
        submission_reason: reason
      })

      setSubmitted(true)
      setResult(res.data)
      localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      console.error('Submit error:', err)
      const data = err.response?.data

      // If already submitted, treat as success
      if (data?.already_submitted) {
        setSubmitted(true)
        setResult({
          score: data.score,
          total: data.total,
          percentage: data.percentage,
          status: data.status,
          submitted: true
        })
        localStorage.removeItem(STORAGE_KEY)
        return
      }

      // If time expired, try auto-submit
      if (data?.time_expired && !autoSubmit) {
        await handleAutoSubmit('Timer expired (retry)')
        return
      }

      setError(data?.error || 'Failed to submit. Please try again.')
    } finally {
      setAutoSubmitting(false)
    }
  }

  // ─── Violation Handler ───
  function handleViolation(type, details) {
    const newCount = violationCount + 1
    setViolationCount(newCount)

    // Log to backend
    if (attempt?.id) {
      api.post(`/attempts/${attempt.id}/violation`, { type, details })
        .then(res => {
          if (res.data?.autoSubmitted) {
            handleAutoSubmit(`Violation limit exceeded (${type})`)
          }
        })
        .catch(() => {})
    }

    // Auto-submit if 3 violations reached
    if (newCount >= 3) {
      handleAutoSubmit(`Violation limit exceeded (${type})`)
    }
  }

  // ─── Format time ───
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // ─── Render: Loading ───
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading assessment...</p>
        </div>
      </div>
    )
  }

  // ─── Render: Error ───
  if (error && !attempt) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-[#1a1a2e] border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Unable to Start Exam</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ─── Render: Submitted ───
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-[#1a1a2e] border border-green-500/20 rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle2 size={48} className="text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            {result?.status === 'auto_submitted' ? 'Auto-Submitted' : 'Exam Submitted!'}
          </h2>
          {result?.message && (
            <p className="text-amber-400 text-sm mb-3">{result.message}</p>
          )}
          {result?.percentage !== undefined && (
            <div className="bg-[#0f0f1a] rounded-xl p-6 mb-6">
              <div className="text-5xl font-bold text-white mb-2">{result.percentage}%</div>
              <p className="text-gray-400 text-sm">
                {result.score}/{result.total} correct
              </p>
              <p className={`text-sm font-medium mt-2 ${
                result.status === 'passed' ? 'text-green-400' : 'text-red-400'
              }`}>
                {result.status === 'passed' ? '✓ Passed' : '✗ Failed'}
              </p>
            </div>
          )}
          {result?.percentage === undefined && (
            <p className="text-gray-400 mb-6">Your results will be available after evaluation.</p>
          )}
          {violationCount > 0 && (
            <p className="text-amber-400/70 text-xs mb-4">
              ⚠ {violationCount} violation{violationCount !== 1 ? 's' : ''} detected
            </p>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ─── Render: Exam UI ───
  const isProctored = exam?.exam_type === 'proctored'
  const currentQuestion = questions[currentIndex]
  const answeredCount = Object.keys(answers).length
  const isLowTime = remainingSeconds <= 120 && remainingSeconds > 0

  const examContent = (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* ─── Header ─── */}
      <header className="bg-[#1a1a2e]/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Left: Exam info */}
          <div className="flex items-center gap-3">
            {isProctored && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <Shield size={14} className="text-amber-400" />
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Proctored</span>
              </div>
            )}
            <h1 className="text-sm font-semibold text-white/90 truncate max-w-[200px] sm:max-w-none">
              {exam?.title || 'Assessment'}
            </h1>
          </div>

          {/* Center: Timer */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold transition-all ${
            isLowTime
              ? 'bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse'
              : 'bg-white/5 text-white/90 border border-white/10'
          }`}>
            <Clock size={16} className={isLowTime ? 'text-red-400' : 'text-blue-400'} />
            {formatTime(remainingSeconds)}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Save Status */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              saveStatus === 'saving' ? 'bg-blue-500/10 text-blue-400' :
              saveStatus === 'saved' ? 'bg-green-500/10 text-green-400' :
              saveStatus === 'error' ? 'bg-red-500/10 text-red-400' :
              'bg-white/5 text-gray-500'
            }`}>
              <Save size={12} />
              {saveStatus === 'saving' ? 'Saving...' :
               saveStatus === 'saved' ? 'Saved' :
               saveStatus === 'error' ? 'Save failed' :
               'Auto-save on'}
            </div>

            {/* Violations */}
            {isProctored && violationCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <ShieldAlert size={12} className="text-red-400" />
                <span className="text-xs font-bold text-red-400">{violationCount}/3</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              disabled={autoSubmitting}
            >
              <Send size={14} />
              Submit
            </button>
          </div>
        </div>
      </header>

      {/* ─── Instructions Banner (first load) ─── */}
      {exam?.instructions && currentIndex === 0 && (
        <div className="max-w-6xl mx-auto w-full px-4 mt-4">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300/80">
            <strong className="text-blue-300">Instructions:</strong> {exam.instructions}
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex max-w-6xl mx-auto w-full">
        {/* Question Panel */}
        <div className="flex-1 p-4 sm:p-6">
          {currentQuestion && (
            <div className="bg-[#1a1a2e] rounded-2xl border border-white/5 p-6 sm:p-8">
              {/* Question number + difficulty */}
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                {currentQuestion.difficulty && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    currentQuestion.difficulty === 'Hard' ? 'bg-red-500/10 text-red-400' :
                    currentQuestion.difficulty === 'Intermediate' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-green-500/10 text-green-400'
                  }`}>
                    {currentQuestion.difficulty}
                  </span>
                )}
              </div>

              {/* Question text */}
              <h2 className="text-lg sm:text-xl font-medium text-white/95 leading-relaxed mb-8">
                {currentQuestion.question_text}
              </h2>

              {/* Options */}
              <div className="space-y-3">
                {currentQuestion.options && Object.entries(currentQuestion.options).map(([key, value]) => {
                  if (!value) return null
                  const isSelected = answers[currentQuestion.id] === key
                  return (
                    <button
                      key={key}
                      onClick={() => selectAnswer(currentQuestion.id, key)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 group ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 text-white'
                          : 'border-white/5 bg-[#0f0f1a] text-gray-300 hover:border-white/15 hover:bg-[#15152a]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                          isSelected
                            ? 'bg-blue-500 text-white'
                            : 'bg-white/5 text-gray-500 group-hover:bg-white/10'
                        }`}>
                          {key}
                        </span>
                        <span className="pt-1 text-sm sm:text-base leading-relaxed">{value}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/5">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                <span className="text-xs text-gray-500">
                  {answeredCount}/{questions.length} answered
                </span>

                <button
                  onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Sidebar: Question Navigator ─── */}
        <div className="hidden lg:block w-72 p-4 pl-0">
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/5 p-5 sticky top-24">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Questions</h3>
              <span className="text-xs text-gray-500">{answeredCount}/{questions.length}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-white/5 mb-5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
              />
            </div>

            {/* Question grid */}
            <div className="grid grid-cols-6 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id]
                const isCurrent = idx === currentIndex
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full aspect-square rounded-lg text-xs font-bold transition-all duration-200 ${
                      isCurrent
                        ? 'bg-blue-500 text-white ring-2 ring-blue-400/50 scale-110'
                        : isAnswered
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-white/5 text-gray-500 hover:bg-white/10'
                    }`}
                    title={`Question ${idx + 1}${isAnswered ? ' (answered)' : ''}`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-500" /> Current
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" /> Answered
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-white/5" /> Pending
              </div>
            </div>

            {/* Quick Submit */}
            <button
              onClick={handleSubmit}
              disabled={autoSubmitting}
              className="w-full mt-5 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Send size={14} />
              Submit Exam
            </button>
          </div>
        </div>
      </div>

      {/* ─── Error Banner ─── */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-6 py-3 rounded-xl z-50 backdrop-blur-xl">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-300 font-bold">✕</button>
        </div>
      )}
    </div>
  )

  // ─── ALL assessments get base security layer ───
  // Fullscreen + StrictMode + ViolationTracker are ALWAYS active.
  // ProctoringGate / CameraMonitor / DebuggerTrap / Heartbeat are ONLY for proctored.

  const securedContent = (
    <FullscreenHandler
      enabled={true}
      onViolation={(type, details) => handleViolation(type, details)}
      onFullscreenChange={setFullscreenActive}
      maxExits={exam?.max_violations || 3}
      onAutoSubmit={handleAutoSubmit}
    >
      <StrictModeWrapper enabled={true} onViolation={handleViolation}>
        {/* Tab/blur violations — always active */}
        <ViolationTracker
          attemptId={attempt?.id}
          onViolation={handleViolation}
          onAutoSubmit={handleAutoSubmit}
          maxWarnings={exam?.max_violations || 3}
          enabled={true}
        />

        {/* Proctored-only extras */}
        {isProctored && (
          <>
            <ProctoringHeartbeat
              attemptId={attempt?.id}
              enabled={true}
              cameraActive={cameraActive}
              fullscreenActive={fullscreenActive}
              faceDetected={faceDetected}
              faceCount={faceCount}
              onAutoSubmit={(reason) => handleAutoSubmit(reason)}
            />
            <DebuggerTrap
              enabled={true}
              attemptId={attempt?.id}
              onViolation={handleViolation}
            />
            <div className="fixed top-20 right-4 z-[60]">
              <CameraMonitor
                enabled={exam?.require_camera}
                onCameraStatus={setCameraActive}
                onFaceStatus={({ detected, count }) => {
                  setFaceDetected(detected)
                  setFaceCount(count)
                }}
                onViolation={handleViolation}
                showPreview={true}
              />
            </div>
          </>
        )}

        {examContent}
      </StrictModeWrapper>
    </FullscreenHandler>
  )

  // If proctored, wrap with ProctoringGate (camera/mic/screen checks)
  if (isProctored) {
    return (
      <ProctoringGate assessmentConfig={exam} onReady={() => {}} onFail={() => navigate('/dashboard')}>
        {securedContent}
      </ProctoringGate>
    )
  }

  return securedContent
}

