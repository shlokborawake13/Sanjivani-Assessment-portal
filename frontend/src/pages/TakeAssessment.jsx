import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, ChevronLeft, ChevronRight, Flag, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import api from '../services/api'
import StrictModeWrapper from '../components/StrictModeWrapper'
import FullscreenHandler from '../components/FullscreenHandler'
import TabSwitchDetector from '../components/TabSwitchDetector'
import ViolationTracker from '../components/ViolationTracker'

export default function TakeAssessment() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [assessment, setAssessment] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [attemptId, setAttemptId] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState([])
  const [marked, setMarked] = useState(new Set())
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const timerRef = useRef(null)
  const autoSaveRef = useRef(null)

  // Shuffle array deterministically
  const shuffleArray = (arr) => {
    const shuffled = [...arr]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Initialize assessment
  useEffect(() => {
    async function init() {
      try {
        const [assessRes, questionsRes] = await Promise.all([
          api.get(`/assessments/${id}`),
          api.get(`/assessments/${id}/questions`)
        ])

        const assess = assessRes.data.assessment
        setAssessment(assess)

        // Randomize question order
        const qs = shuffleArray(questionsRes.data.questions || [])
        setQuestions(qs)
        setAnswers(new Array(qs.length).fill(null).map((_, i) => ({ question_id: qs[i]?.id, selected: null })))

        // Parse duration (e.g., "60 min" -> 3600 seconds)
        const durationMatch = assess.duration?.match(/(\d+)/)
        const minutes = durationMatch ? parseInt(durationMatch[1]) : 60
        setTimeLeft(minutes * 60)

        // Start attempt
        const { data } = await api.post('/attempts', { assessment_id: id })
        setAttemptId(data.attempt.id)
      } catch (err) {
        console.error('Init error:', err)
        alert('Failed to load assessment')
        navigate('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [id, navigate])

  // Timer countdown
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

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!attemptId || submitted) return

    autoSaveRef.current = setInterval(() => {
      api.put(`/attempts/${attemptId}/answers`, { answers }).catch(() => {})
    }, 30000)

    return () => clearInterval(autoSaveRef.current)
  }, [attemptId, answers, submitted])

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const selectAnswer = (option) => {
    setAnswers(prev => {
      const updated = [...prev]
      updated[currentIdx] = { ...updated[currentIdx], selected: option }
      return updated
    })
  }

  const toggleMark = () => {
    setMarked(prev => {
      const next = new Set(prev)
      next.has(currentIdx) ? next.delete(currentIdx) : next.add(currentIdx)
      return next
    })
  }

  const handleSubmit = async (reason = null) => {
    if (submitting || submitted) return
    setSubmitting(true)

    try {
      clearInterval(timerRef.current)
      clearInterval(autoSaveRef.current)

      const { data } = await api.put(`/attempts/${attemptId}/submit`, {
        answers,
        submission_reason: reason
      })

      setResult(data)
      setSubmitted(true)
    } catch (err) {
      console.error('Submit error:', err)
      alert('Failed to submit. Please try again.')
    }
    setSubmitting(false)
  }

  const handleAutoSubmit = useCallback((reason) => {
    handleSubmit(reason)
  }, [attemptId, answers])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100]">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-on-surface-variant">Loading assessment...</p>
        </div>
      </div>
    )
  }

  // Show results after submission
  if (submitted && result) {
    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100] p-4">
        <div className="bg-surface-lowest rounded-2xl p-8 max-w-md w-full text-center animate-fade-in" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 ${
            result.status === 'passed' ? 'bg-[#dcfce7]' : 'bg-[#fef2f2]'
          }`}>
            {result.status === 'passed' ? (
              <CheckCircle2 size={36} className="text-[#166534]" />
            ) : (
              <AlertTriangle size={36} className="text-error" />
            )}
          </div>

          <h2 className="text-2xl font-bold text-on-surface mb-2">
            {result.status === 'passed' ? 'Congratulations!' : 'Assessment Complete'}
          </h2>
          <p className="text-sm text-on-surface-variant mb-6">
            {result.attempt?.submission_reason || 'Manual submission'}
          </p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-surface-low rounded-xl p-4">
              <p className="text-2xl font-bold text-on-surface">{result.score}</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Correct</p>
            </div>
            <div className="bg-surface-low rounded-xl p-4">
              <p className="text-2xl font-bold text-on-surface">{result.total}</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Total</p>
            </div>
            <div className="bg-surface-low rounded-xl p-4">
              <p className="text-2xl font-bold text-primary">{result.percentage}%</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Score</p>
            </div>
          </div>

          {result.attempt?.violation_count > 0 && (
            <div className="bg-[#fef2f2] rounded-lg px-4 py-2 mb-4 text-xs text-error">
              {result.attempt.violation_count} violation(s) recorded
            </div>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="btn-gradient w-full py-3 rounded-xl text-sm font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentIdx]
  const answered = answers.filter(a => a?.selected).length
  const isLowTime = timeLeft < 120

  return (
    <ViolationTracker attemptId={attemptId} onAutoSubmit={handleAutoSubmit}>
      {({ logViolation }) => (
        <StrictModeWrapper enabled onViolation={logViolation}>
          <FullscreenHandler enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />
          <TabSwitchDetector enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />

          <div className="fixed inset-0 bg-surface-lowest z-[100] flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-surface-lowest border-b border-outline/10" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div>
                <h1 className="text-sm font-semibold text-on-surface">{assessment?.title}</h1>
                <p className="text-[10px] text-on-surface-variant">{assessment?.category} • {questions.length} Questions</p>
              </div>

              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-bold ${
                isLowTime ? 'bg-[#fef2f2] text-error animate-pulse' : 'bg-surface-low text-on-surface'
              }`}>
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-on-surface-variant">{answered}/{questions.length} answered</span>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="btn-gradient px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Send size={12} /> Submit
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Question Navigation Sidebar */}
              <div className="w-20 bg-surface-low border-r border-outline/10 overflow-y-auto p-3 flex flex-col gap-2">
                {questions.map((_, idx) => {
                  const isAnswered = answers[idx]?.selected
                  const isMarked = marked.has(idx)
                  const isCurrent = idx === currentIdx

                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentIdx(idx)}
                      className={`w-full aspect-square rounded-lg text-xs font-bold flex items-center justify-center relative transition-all ${
                        isCurrent
                          ? 'bg-primary text-white shadow-md scale-105'
                          : isAnswered
                            ? 'bg-[#dcfce7] text-[#166534]'
                            : 'bg-surface-lowest text-on-surface-variant hover:bg-surface-high'
                      }`}
                    >
                      {idx + 1}
                      {isMarked && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#f59e0b] rounded-full border-2 border-surface-low" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Question Area */}
              <div className="flex-1 overflow-y-auto p-6 md:p-10">
                <div className="max-w-3xl mx-auto">
                  {/* Question Header */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                      Question {currentIdx + 1} of {questions.length}
                    </span>
                    <button
                      onClick={toggleMark}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        marked.has(currentIdx) ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-surface-high text-on-surface-variant hover:bg-surface-highest'
                      }`}
                    >
                      <Flag size={12} />
                      {marked.has(currentIdx) ? 'Marked' : 'Mark for review'}
                    </button>
                  </div>

                  {/* Question Text */}
                  <div className="bg-surface-lowest rounded-xl p-6 mb-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                    <p className="text-base text-on-surface leading-relaxed font-medium">
                      {currentQuestion?.question_text}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="flex flex-col gap-3 mb-8">
                    {['A', 'B', 'C', 'D'].map(opt => {
                      const optText = currentQuestion?.[`option_${opt.toLowerCase()}`]
                      if (!optText) return null
                      const isSelected = answers[currentIdx]?.selected === opt

                      return (
                        <button
                          key={opt}
                          onClick={() => selectAnswer(opt)}
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-primary bg-primary/[0.04] shadow-sm'
                              : 'border-outline/15 bg-surface-lowest hover:border-outline/30 hover:bg-surface-low'
                          }`}
                        >
                          <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                            isSelected ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'
                          }`}>
                            {opt}
                          </span>
                          <span className={`text-sm ${isSelected ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                            {optText}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                      disabled={currentIdx === 0}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-high transition-colors disabled:opacity-30"
                    >
                      <ChevronLeft size={16} /> Previous
                    </button>
                    <button
                      onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))}
                      disabled={currentIdx === questions.length - 1}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-30"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm Submit Modal */}
            {showConfirm && (
              <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
                <div className="bg-surface-lowest rounded-2xl p-8 max-w-sm w-full animate-fade-in" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
                  <h3 className="text-lg font-semibold text-on-surface mb-3">Submit Assessment?</h3>
                  <p className="text-sm text-on-surface-variant mb-2">
                    You have answered <strong>{answered}</strong> out of <strong>{questions.length}</strong> questions.
                  </p>
                  {questions.length - answered > 0 && (
                    <p className="text-xs text-error mb-4">
                      {questions.length - answered} question(s) unanswered.
                    </p>
                  )}
                  {marked.size > 0 && (
                    <p className="text-xs text-[#92400e] mb-4">
                      {marked.size} question(s) marked for review.
                    </p>
                  )}
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-high text-on-surface-variant hover:bg-surface-highest">
                      Cancel
                    </button>
                    <button
                      onClick={() => { setShowConfirm(false); handleSubmit() }}
                      disabled={submitting}
                      className="flex-1 btn-gradient py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                    >
                      {submitting ? 'Submitting...' : 'Confirm Submit'}
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
