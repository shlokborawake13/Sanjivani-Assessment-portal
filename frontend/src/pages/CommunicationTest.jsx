import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, Send, CheckCircle2, AlertTriangle, Mic, MicOff, Type } from 'lucide-react'
import api from '../services/api'
import StrictModeWrapper from '../components/StrictModeWrapper'
import FullscreenHandler from '../components/FullscreenHandler'
import TabSwitchDetector from '../components/TabSwitchDetector'
import ViolationTracker from '../components/ViolationTracker'
import CameraMonitor from '../components/CameraMonitor'

export default function CommunicationTest() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [assessment, setAssessment] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [attemptId, setAttemptId] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [textAnswers, setTextAnswers] = useState([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
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
        setTextAnswers(new Array(qs.length).fill(''))

        const durationMatch = assess.duration?.match(/(\d+)/)
        const minutes = durationMatch ? parseInt(durationMatch[1]) : 30
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

  const updateText = (val) => {
    setTextAnswers(prev => {
      const updated = [...prev]
      updated[currentIdx] = val
      return updated
    })
  }

  // Rule-based scoring for communication
  const scoreResponse = (text) => {
    if (!text || text.trim().length === 0) return { total: 0, details: {} }

    const words = text.trim().split(/\s+/).length
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length
    const avgWordLength = text.replace(/\s+/g, '').length / Math.max(words, 1)
    const hasGreeting = /^(dear|hello|hi|greetings|good\s)/i.test(text.trim())
    const hasClosing = /(regards|sincerely|thank|yours|best)/i.test(text)
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0).length

    // Scoring criteria (out of 100)
    let wordScore = Math.min(30, (words / 150) * 30) // 150+ words = full marks
    let structureScore = Math.min(20, sentences * 3) // Good sentence variation
    let clarityScore = Math.min(20, avgWordLength > 3 && avgWordLength < 8 ? 20 : 10)
    let formatScore = Math.min(15, (hasGreeting ? 5 : 0) + (hasClosing ? 5 : 0) + (paragraphs > 1 ? 5 : 0))
    let grammarScore = Math.min(15, sentences > 3 ? 15 : sentences * 4) // Proxy for complexity

    const total = Math.round(wordScore + structureScore + clarityScore + formatScore + grammarScore)

    return {
      total,
      details: {
        'Word Count': `${words} words (${Math.round(wordScore)}/30)`,
        'Structure': `${sentences} sentences (${Math.round(structureScore)}/20)`,
        'Clarity': `${Math.round(clarityScore)}/20`,
        'Format': `${Math.round(formatScore)}/15`,
        'Grammar': `${Math.round(grammarScore)}/15`,
      }
    }
  }

  const handleSubmit = async (reason = null) => {
    if (submitting || submitted) return
    setSubmitting(true)
    try {
      clearInterval(timerRef.current)
      const answers = questions.map((q, i) => ({
        question_id: q.id,
        selected: textAnswers[i] ? 'A' : null,
        text_response: textAnswers[i]
      }))
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
  }, [attemptId, textAnswers])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100]">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (permissionDenied) {
    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100] p-4">
        <div className="bg-surface-lowest rounded-2xl p-8 max-w-sm text-center animate-fade-in" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          <AlertTriangle size={48} className="text-error mx-auto mb-4" />
          <h2 className="text-xl font-bold text-on-surface mb-2">Camera Access Required</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            Camera and microphone access is required for the communication assessment. Please grant permissions and try again.
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn-gradient w-full py-3 rounded-xl text-sm font-semibold">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (submitted && result) {
    // Calculate communication scores for each answer
    const scores = textAnswers.map(t => scoreResponse(t))
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + sc.total, 0) / scores.length) : 0

    return (
      <div className="fixed inset-0 bg-surface-lowest flex items-center justify-center z-[100] p-4 overflow-y-auto">
        <div className="bg-surface-lowest rounded-2xl p-8 max-w-lg w-full text-center animate-fade-in my-10" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          <CheckCircle2 size={48} className="text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-on-surface mb-2">Communication Assessment Complete</h2>
          <p className="text-sm text-on-surface-variant mb-4">{result.attempt?.submission_reason || 'Submitted'}</p>

          <div className="bg-surface-low rounded-xl p-4 mb-4">
            <p className="text-3xl font-bold text-primary">{avgScore}%</p>
            <p className="text-xs text-on-surface-variant">Overall Communication Score</p>
          </div>

          {scores[0] && (
            <div className="text-left bg-surface-low rounded-xl p-4 mb-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-3">Score Breakdown</h4>
              {Object.entries(scores[0].details).map(([key, val]) => (
                <div key={key} className="flex justify-between text-xs py-1.5 border-b border-outline/10 last:border-0">
                  <span className="text-on-surface-variant">{key}</span>
                  <span className="text-on-surface font-medium">{val}</span>
                </div>
              ))}
            </div>
          )}

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
  const wordCount = textAnswers[currentIdx]?.trim().split(/\s+/).filter(w => w).length || 0
  const isLowTime = timeLeft < 120

  return (
    <ViolationTracker attemptId={attemptId} onAutoSubmit={handleAutoSubmit}>
      {({ logViolation }) => (
        <StrictModeWrapper enabled onViolation={logViolation}>
          <FullscreenHandler enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />
          <TabSwitchDetector enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />
          <CameraMonitor
            enabled
            onViolation={logViolation}
            onAutoSubmit={handleAutoSubmit}
            onPermissionDenied={() => setPermissionDenied(true)}
          />

          <div className="fixed inset-0 bg-surface-lowest z-[100] flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-surface-lowest border-b border-outline/10" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div>
                <h1 className="text-sm font-semibold text-on-surface">{assessment?.title}</h1>
                <p className="text-[10px] text-on-surface-variant">Communication • Prompt {currentIdx + 1}/{questions.length}</p>
              </div>

              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-bold ${
                isLowTime ? 'bg-[#fef2f2] text-error animate-pulse' : 'bg-surface-low text-on-surface'
              }`}>
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>

              <button onClick={() => handleSubmit()} disabled={submitting}
                className="btn-gradient px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                <Send size={12} /> Submit
              </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-40">
              <div className="max-w-3xl mx-auto">
                {/* Prompt */}
                <div className="bg-gradient-to-br from-primary/[0.04] to-accent/[0.02] rounded-xl p-6 mb-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Type size={16} className="text-accent" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-accent">Prompt {currentIdx + 1}</span>
                  </div>
                  <p className="text-base text-on-surface leading-relaxed font-medium">
                    {current?.question_text || 'No prompt available.'}
                  </p>
                </div>

                {/* Response Area */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Your Response</label>
                    <span className={`text-xs font-mono ${wordCount >= 100 ? 'text-[#22c55e]' : 'text-on-surface-variant'}`}>
                      {wordCount} words
                    </span>
                  </div>
                  <textarea
                    value={textAnswers[currentIdx] || ''}
                    onChange={(e) => updateText(e.target.value)}
                    className="w-full min-h-[300px] bg-surface-lowest border-2 border-outline/15 rounded-xl p-5 text-sm text-on-surface leading-relaxed outline-none focus:border-primary transition-colors resize-none"
                    placeholder="Write your response here. Be clear, structured, and professional..."
                    spellCheck
                  />
                </div>

                {/* Tips */}
                <div className="bg-surface-low rounded-xl p-4 text-xs text-on-surface-variant">
                  <p className="font-semibold text-on-surface mb-2">Tips for a high score:</p>
                  <ul className="list-disc list-inside flex flex-col gap-1">
                    <li>Write at least 150 words for full word count score</li>
                    <li>Use proper sentence structure with punctuation</li>
                    <li>Include a greeting and closing if appropriate</li>
                    <li>Organize your response in multiple paragraphs</li>
                    <li>Stay on topic and address all parts of the prompt</li>
                  </ul>
                </div>

                {/* Question navigation */}
                {questions.length > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
                      className="px-4 py-2 rounded-xl text-sm text-on-surface-variant hover:bg-surface-high disabled:opacity-30">
                      ← Previous
                    </button>
                    <div className="flex gap-2">
                      {questions.map((_, i) => (
                        <button key={i} onClick={() => setCurrentIdx(i)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold ${
                            i === currentIdx ? 'bg-primary text-white' : textAnswers[i]?.trim() ? 'bg-[#dcfce7] text-[#166534]' : 'bg-surface-high text-on-surface-variant'
                          }`}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))} disabled={currentIdx === questions.length - 1}
                      className="px-4 py-2 rounded-xl text-sm text-primary hover:bg-primary/10 disabled:opacity-30">
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </StrictModeWrapper>
      )}
    </ViolationTracker>
  )
}
