import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, Send, CheckCircle2, AlertTriangle, Type, ChevronLeft, ChevronRight, Save, Loader2, Award, BookOpen, MessageSquare, Sparkles } from 'lucide-react'
import api from '../services/api'
import StrictModeWrapper from '../components/StrictModeWrapper'
import FullscreenHandler from '../components/FullscreenHandler'
import TabSwitchDetector from '../components/TabSwitchDetector'
import ViolationTracker from '../components/ViolationTracker'

export default function CommunicationTest() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Session state
  const [sessionId, setSessionId] = useState(null)
  const [assessmentTitle, setAssessmentTitle] = useState('')
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [textAnswers, setTextAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)

  const [autoSaveStatus, setAutoSaveStatus] = useState('')

  const timerRef = useRef(null)
  const questionStartTime = useRef(Date.now())
  const autoSaveTimer = useRef(null)

  // ─── Initialization ───────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const { data } = await api.post('/communication/session/start', { assessment_id: id })

        setSessionId(data.sessionId)
        setAssessmentTitle(data.title)

        const durationMatch = data.duration?.match(/(\d+)/)
        const minutes = durationMatch ? parseInt(durationMatch[1]) : 30
        setTimeLeft(minutes * 60)

        // Load questions
        const qRes = await api.get(`/communication/session/${data.sessionId}/questions`)
        const qs = qRes.data.questions || []
        setQuestions(qs)

        // Restore saved responses
        const savedAnswers = {}
        qs.forEach(q => {
          if (q.saved_response) savedAnswers[q.id] = q.saved_response
        })
        setTextAnswers(savedAnswers)
      } catch (err) {
        console.error('Init error:', err)
        const msg = err.response?.data?.error || err.message || 'Unknown error'
        alert(`Failed to load communication assessment: ${msg}`)
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

  // ─── Auto-save every 30 seconds ───────────────────────────
  useEffect(() => {
    if (submitted || loading || !sessionId) return
    autoSaveTimer.current = setInterval(() => {
      const currentQ = questions[currentIdx]
      if (currentQ && textAnswers[currentQ.id]?.trim()) {
        saveAnswer(currentQ.id, textAnswers[currentQ.id], true)
      }
    }, 30000)
    return () => clearInterval(autoSaveTimer.current)
  }, [submitted, loading, sessionId, currentIdx, textAnswers])

  // Reset question timer on navigation
  useEffect(() => { questionStartTime.current = Date.now() }, [currentIdx])

  // ─── Save Answer ──────────────────────────────────────────
  const saveAnswer = async (questionId, text, isAutoSave = false) => {
    if (!sessionId || submitted) return
    try {
      if (!isAutoSave) setSaving(true)
      const elapsed = Math.round((Date.now() - questionStartTime.current) / 1000)
      await api.post(`/communication/session/${sessionId}/answer`, {
        question_id: questionId,
        text_response: text,
        time_taken: elapsed,
      })
      if (isAutoSave) {
        setAutoSaveStatus('Saved')
        setTimeout(() => setAutoSaveStatus(''), 2000)
      }
    } catch (err) {
      console.error('Save error:', err)
      if (isAutoSave) setAutoSaveStatus('Save failed')
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  // ─── Handlers ─────────────────────────────────────────────
  const updateText = (val) => {
    const qId = questions[currentIdx]?.id
    if (!qId) return
    setTextAnswers(prev => ({ ...prev, [qId]: val }))
  }

  const goToQuestion = (idx) => {
    // Auto-save current before navigating
    const currentQ = questions[currentIdx]
    if (currentQ && textAnswers[currentQ.id]?.trim()) {
      saveAnswer(currentQ.id, textAnswers[currentQ.id], true)
    }
    setCurrentIdx(idx)
  }

  const handleSubmit = async (reason = null) => {
    if (submitting || submitted) return
    if (!reason) {
      const unanswered = questions.filter(q => !textAnswers[q.id]?.trim()).length
      if (unanswered > 0) {
        const ok = confirm(`You have ${unanswered} unanswered question(s). Are you sure you want to submit?`)
        if (!ok) return
      }
    }

    setSubmitting(true)
    try {
      clearInterval(timerRef.current)
      clearInterval(autoSaveTimer.current)

      // Save all remaining answers first
      for (const q of questions) {
        if (textAnswers[q.id]?.trim()) {
          await saveAnswer(q.id, textAnswers[q.id])
        }
      }

      // Finalize — triggers AI evaluation
      const { data } = await api.post(`/communication/session/${sessionId}/finalize`, {
        submission_reason: reason,
      })

      setResult(data)
      setSubmitted(true)
    } catch (err) {
      console.error('Submit error:', err)
      const msg = err.response?.data?.error || err.message || 'Unknown error'
      alert(`Submit failed: ${msg}`)
    }
    setSubmitting(false)
  }

  const handleAutoSubmit = useCallback((reason) => {
    handleSubmit(reason)
  }, [sessionId, textAnswers, questions])

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  // ─── Loading ──────────────────────────────────────────────
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



  // ─── Submitting Overlay ───────────────────────────────────
  if (submitting) {
    return (
      <div className="fixed inset-0 bg-surface-lowest/95 backdrop-blur-md flex items-center justify-center z-[200]">
        <div className="text-center animate-fade-in">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-primary rounded-full animate-spin" />
            <Sparkles size={28} className="absolute inset-0 m-auto text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Evaluating Your Responses</h2>
          <p className="text-sm text-on-surface-variant">AI is analyzing grammar, clarity, structure & vocabulary...</p>
          <p className="text-xs text-on-surface-variant mt-2">This may take a moment</p>
        </div>
      </div>
    )
  }

  // ─── Results Screen ───────────────────────────────────────
  if (submitted && result) {
    const evals = result.evaluations || {}
    const avgScore = result.percentage || 0

    // Determine grade
    const grade = avgScore >= 90 ? 'A+' : avgScore >= 80 ? 'A' : avgScore >= 70 ? 'B+' : avgScore >= 60 ? 'B' : avgScore >= 50 ? 'C' : avgScore >= 40 ? 'D' : 'F'
    const gradeColor = avgScore >= 70 ? 'text-[#22c55e]' : avgScore >= 50 ? 'text-[#f59e0b]' : 'text-error'

    // Aggregate scores across all evaluations
    let totalGrammar = 0, totalClarity = 0, totalStructure = 0, totalVocab = 0, count = 0
    Object.values(evals).forEach(e => {
      if (e.source !== 'none') {
        totalGrammar += e.grammar || 0
        totalClarity += e.clarity || 0
        totalStructure += e.structure || 0
        totalVocab += e.vocabulary || 0
        count++
      }
    })
    const avgGrammar = count > 0 ? Math.round(totalGrammar / count) : 0
    const avgClarity = count > 0 ? Math.round(totalClarity / count) : 0
    const avgStructure = count > 0 ? Math.round(totalStructure / count) : 0
    const avgVocab = count > 0 ? Math.round(totalVocab / count) : 0

    const scoreCategories = [
      { label: 'Grammar', score: avgGrammar, max: 25, color: '#3b82f6', icon: '📝' },
      { label: 'Clarity', score: avgClarity, max: 25, color: '#22c55e', icon: '💡' },
      { label: 'Structure', score: avgStructure, max: 25, color: '#f59e0b', icon: '🏗️' },
      { label: 'Vocabulary', score: avgVocab, max: 25, color: '#8b5cf6', icon: '📖' },
    ]

    return (
      <div className="fixed inset-0 bg-surface-lowest z-[100] overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 py-10">
          {/* Header */}
          <div className="text-center mb-8 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent mx-auto mb-4 flex items-center justify-center">
              <Award size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-on-surface mb-1">Communication Assessment Complete</h1>
            <p className="text-sm text-on-surface-variant">{result.attempt?.submission_reason || 'Submitted successfully'}</p>
            {result.evaluations && Object.values(result.evaluations).some(e => e.source === 'ai') && (
              <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <Sparkles size={12} /> AI-Powered Evaluation
              </span>
            )}
          </div>

          {/* Overall Score Card */}
          <div className="bg-gradient-to-br from-primary/[0.06] to-accent/[0.03] rounded-2xl p-6 mb-6 text-center" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center justify-center gap-6">
              <div>
                <p className={`text-5xl font-black ${gradeColor}`}>{grade}</p>
                <p className="text-xs text-on-surface-variant mt-1">Grade</p>
              </div>
              <div className="w-px h-14 bg-outline/15" />
              <div>
                <p className="text-4xl font-bold text-on-surface">{avgScore}<span className="text-lg text-on-surface-variant">%</span></p>
                <p className="text-xs text-on-surface-variant mt-1">Overall Score</p>
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {scoreCategories.map(cat => (
              <div key={cat.label} className="bg-surface-lowest rounded-xl p-4" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-xs font-semibold text-on-surface-variant">{cat.label}</span>
                </div>
                <p className="text-xl font-bold text-on-surface">{cat.score}<span className="text-xs text-on-surface-variant font-normal">/{cat.max}</span></p>
                <div className="mt-2 h-1.5 bg-surface-high rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(cat.score / cat.max) * 100}%`, backgroundColor: cat.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Per-question Feedback */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
              <MessageSquare size={16} className="text-accent" /> Detailed Feedback
            </h3>
            {questions.map((q, i) => {
              const ev = evals[q.id]
              if (!ev) return null
              return (
                <div key={q.id} className="bg-surface-lowest rounded-xl p-4 mb-3" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-accent">Question {i + 1}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      ev.total >= 70 ? 'bg-[#dcfce7] text-[#166534]' : ev.total >= 40 ? 'bg-[#fef9c3] text-[#854d0e]' : 'bg-[#fef2f2] text-error'
                    }`}>{ev.total}/100</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-2 line-clamp-2">{q.question_text}</p>
                  {ev.feedback && (
                    <div className="bg-primary/[0.04] rounded-lg p-3 mt-2">
                      <p className="text-xs text-on-surface leading-relaxed">{ev.feedback}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {[
                      { label: 'Grammar', val: ev.grammar },
                      { label: 'Clarity', val: ev.clarity },
                      { label: 'Structure', val: ev.structure },
                      { label: 'Vocabulary', val: ev.vocabulary },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-sm font-bold text-on-surface">{s.val}</p>
                        <p className="text-[10px] text-on-surface-variant">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Flags */}
          {(result.plagiarismFlagged || result.violationCount > 0) && (
            <div className="bg-[#fef2f2] rounded-xl p-4 mb-6">
              {result.plagiarismFlagged && (
                <p className="text-xs text-error flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} /> Potential plagiarism detected
                </p>
              )}
              {result.violationCount > 0 && (
                <p className="text-xs text-error flex items-center gap-2">
                  <AlertTriangle size={14} /> {result.violationCount} violation(s) recorded
                </p>
              )}
            </div>
          )}

          <button onClick={() => navigate('/dashboard')} className="btn-gradient w-full py-3.5 rounded-xl text-sm font-semibold">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ─── Main Assessment UI ───────────────────────────────────
  const current = questions[currentIdx]
  const currentText = textAnswers[current?.id] || ''
  const wordCount = currentText.trim().split(/\s+/).filter(w => w).length
  const isLowTime = timeLeft < 120
  const answeredCount = questions.filter(q => textAnswers[q.id]?.trim()).length

  return (
    <ViolationTracker attemptId={sessionId} onAutoSubmit={handleAutoSubmit}>
      {({ logViolation }) => (
        <StrictModeWrapper enabled allowTextInput onViolation={logViolation}>
          <FullscreenHandler enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />
          <TabSwitchDetector enabled onViolation={logViolation} onAutoSubmit={handleAutoSubmit} />

          <div className="fixed inset-0 bg-surface-lowest z-[100] flex flex-col">
            {/* ─── Top Bar ─────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-surface-lowest border-b border-outline/10" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <BookOpen size={16} className="text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-on-surface leading-tight">{assessmentTitle}</h1>
                  <p className="text-[10px] text-on-surface-variant">
                    Communication • {answeredCount}/{questions.length} answered
                    {autoSaveStatus && <span className="ml-2 text-[#22c55e]">✓ {autoSaveStatus}</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
                  isLowTime ? 'bg-[#fef2f2] text-error animate-pulse' : 'bg-surface-low text-on-surface'
                }`}>
                  <Clock size={14} />
                  {formatTime(timeLeft)}
                </div>

                <button
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  className="btn-gradient px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Send size={12} /> Submit
                </button>
              </div>
            </div>

            {/* ─── Main Content ────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto p-4 md:p-8 pb-32">
                {/* Question Prompt */}
                <div className="bg-gradient-to-br from-primary/[0.05] to-accent/[0.02] rounded-2xl p-5 md:p-6 mb-5" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10">
                      <Type size={12} className="text-accent" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                        {current?.question_type === 'email' ? 'Email Writing' : current?.question_type === 'comprehension' ? 'Comprehension' : 'Essay'}
                      </span>
                    </div>
                    <span className="text-[10px] text-on-surface-variant ml-auto">
                      Question {currentIdx + 1} of {questions.length}
                    </span>
                  </div>
                  <p className="text-base text-on-surface leading-relaxed font-medium whitespace-pre-wrap">
                    {current?.question_text || 'No prompt available.'}
                  </p>
                </div>

                {/* Response Area */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Your Response</label>
                    <div className="flex items-center gap-3">
                      {saving && (
                        <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                          <Loader2 size={10} className="animate-spin" /> Saving...
                        </span>
                      )}
                      <span className={`text-xs font-mono font-medium ${
                        wordCount >= 150 ? 'text-[#22c55e]' : wordCount >= 50 ? 'text-[#f59e0b]' : 'text-on-surface-variant'
                      }`}>
                        {wordCount} words
                      </span>
                    </div>
                  </div>

                  <textarea
                    value={currentText}
                    onChange={(e) => updateText(e.target.value)}
                    className="w-full min-h-[320px] bg-surface-lowest border-2 border-outline/15 rounded-xl p-5 text-sm text-on-surface leading-relaxed outline-none focus:border-primary transition-colors resize-none"
                    placeholder="Write your response here. Be clear, structured, and professional..."
                    spellCheck
                    autoFocus
                  />

                  {/* Word count guide bars */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-surface-high rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (wordCount / 150) * 100)}%`,
                          backgroundColor: wordCount >= 150 ? '#22c55e' : wordCount >= 50 ? '#f59e0b' : 'var(--color-outline)',
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-on-surface-variant whitespace-nowrap">
                      {wordCount < 50 ? 'Keep writing...' : wordCount < 150 ? 'Good, aim for 150+' : '✓ Great length!'}
                    </span>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={() => saveAnswer(current?.id, currentText)}
                  disabled={saving || !currentText.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-surface-low text-on-surface hover:bg-surface-high transition-colors disabled:opacity-30 mb-6"
                >
                  <Save size={12} /> Save Response
                </button>

                {/* Tips */}
                <div className="bg-surface-low rounded-xl p-4 text-xs text-on-surface-variant mb-6">
                  <p className="font-semibold text-on-surface mb-2 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-accent" /> Tips for a high AI score:
                  </p>
                  <ul className="list-disc list-inside flex flex-col gap-1.5">
                    <li>Write at least 150 words for best results</li>
                    <li>Use proper grammar, punctuation, and capitalization</li>
                    <li>Organize your response with clear paragraphs</li>
                    <li>Include appropriate greeting and closing for emails</li>
                    <li>Use diverse vocabulary and professional language</li>
                    <li>Stay on topic and address all parts of the prompt</li>
                  </ul>
                </div>

                {/* Question Navigation */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => goToQuestion(Math.max(0, currentIdx - 1))}
                    disabled={currentIdx === 0}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-on-surface-variant hover:bg-surface-high disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>

                  <div className="flex gap-2">
                    {questions.map((q, i) => (
                      <button
                        key={q.id}
                        onClick={() => goToQuestion(i)}
                        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                          i === currentIdx
                            ? 'bg-gradient-to-br from-primary to-accent text-white shadow-md scale-110'
                            : textAnswers[q.id]?.trim()
                              ? 'bg-[#dcfce7] text-[#166534]'
                              : 'bg-surface-high text-on-surface-variant hover:bg-surface-low'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => goToQuestion(Math.min(questions.length - 1, currentIdx + 1))}
                    disabled={currentIdx === questions.length - 1}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </StrictModeWrapper>
      )}
    </ViolationTracker>
  )
}
