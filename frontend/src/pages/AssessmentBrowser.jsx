import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Brain, Code, MessageSquare, Lightbulb,
  ChevronRight, ArrowLeft, Clock, Users, Lock,
  CheckCircle2, Shield, BookOpen, Zap, Target
} from 'lucide-react'
import api from '../services/api'

const ASSESSMENT_TYPES = [
  {
    id: 'aptitude',
    label: 'Aptitude',
    description: 'Quantitative, logical, and verbal reasoning',
    icon: Brain,
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
  },
  {
    id: 'coding',
    label: 'Coding',
    description: 'Programming challenges with real execution',
    icon: Code,
    gradient: 'from-emerald-500 to-green-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
  },
  {
    id: 'communication',
    label: 'Communication',
    description: 'Written expression and language skills',
    icon: MessageSquare,
    gradient: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
  },
  {
    id: 'technical_reasoning',
    label: 'Technical Reasoning',
    description: 'Analytical and technical problem-solving',
    icon: Lightbulb,
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
  },
]

const DIFFICULTIES = ['Easy', 'Intermediate', 'Hard']

const difficultyStyles = {
  Easy: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400' },
  Intermediate: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  Hard: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
}

export default function AssessmentBrowser() {
  const navigate = useNavigate()

  // Flow state
  const [step, setStep] = useState(1) // 1=Type, 2=Topic, 3=Difficulty, 4=Assessments
  const [selectedType, setSelectedType] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)

  // Data
  const [topics, setTopics] = useState([])
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(false)

  // Load topics when type is selected
  useEffect(() => {
    if (!selectedType) return
    loadTopics()
  }, [selectedType])

  // Load assessments when filters change
  useEffect(() => {
    if (step === 4) loadAssessments()
  }, [step, selectedType, selectedTopic, selectedDifficulty])

  async function loadTopics() {
    try {
      setLoading(true)
      const res = await api.get(`/assessments/browse/topics?type=${selectedType}`)
      setTopics(res.data.topics || [])
    } catch (err) {
      console.error('Load topics error:', err)
      setTopics([])
    } finally {
      setLoading(false)
    }
  }

  async function loadAssessments() {
    try {
      setLoading(true)
      const params = new URLSearchParams({ type: selectedType })
      if (selectedTopic) params.append('topic', selectedTopic)
      if (selectedDifficulty) params.append('difficulty', selectedDifficulty)
      const res = await api.get(`/assessments/browse/filter?${params}`)
      setAssessments(res.data.assessments || [])
    } catch (err) {
      console.error('Load assessments error:', err)
      setAssessments([])
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    if (step > 1) setStep(step - 1)
    else navigate('/dashboard')
  }

  function selectType(typeId) {
    setSelectedType(typeId)
    setSelectedTopic(null)
    setSelectedDifficulty(null)
    setStep(2)
  }

  function selectTopic(topicName) {
    setSelectedTopic(topicName)
    setStep(3)
  }

  function selectDifficulty(diff) {
    setSelectedDifficulty(diff)
    setStep(4)
  }

  function startAssessment(assessment) {
    const cat = (assessment.category || assessment.assessment_type || '').toLowerCase()
    if (cat === 'coding') {
      navigate(`/assessment/${assessment.id}/code`)
    } else if (cat === 'communication') {
      navigate(`/assessment/${assessment.id}/communicate`)
    } else {
      navigate(`/assessment/${assessment.id}/take`)
    }
  }

  const typeConfig = ASSESSMENT_TYPES.find(t => t.id === selectedType)

  // ─── Step indicators ───
  const steps = ['Type', 'Topic', 'Difficulty', 'Start']

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="bg-[#1a1a2e]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <ArrowLeft size={18} className="text-gray-400" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-white">Browse Assessments</h1>
              <p className="text-[11px] text-gray-500">
                {selectedType && typeConfig?.label}
                {selectedTopic && ` → ${selectedTopic}`}
                {selectedDifficulty && ` → ${selectedDifficulty}`}
              </p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="hidden sm:flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  i + 1 === step
                    ? 'bg-blue-500 text-white scale-110'
                    : i + 1 < step
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-white/5 text-gray-600'
                }`}>
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-6 h-px ${i + 1 < step ? 'bg-green-500/30' : 'bg-white/5'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Step 1: Select Type */}
        {step === 1 && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Choose Assessment Type</h2>
              <p className="text-gray-400 text-sm">Select the category you want to practice</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ASSESSMENT_TYPES.map(type => {
                const Icon = type.icon
                return (
                  <button
                    key={type.id}
                    onClick={() => selectType(type.id)}
                    className={`group relative overflow-hidden p-6 rounded-2xl border ${type.border} ${type.bg} hover:scale-[1.02] transition-all duration-300 text-left`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${type.gradient} flex items-center justify-center shadow-lg`}>
                        <Icon size={24} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-1">{type.label}</h3>
                        <p className="text-sm text-gray-400">{type.description}</p>
                      </div>
                      <ChevronRight size={20} className="text-gray-500 group-hover:text-white transition-colors mt-1" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2: Select Topic */}
        {step === 2 && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Select Topic</h2>
              <p className="text-gray-400 text-sm">
                Available topics in <span className={typeConfig?.text}>{typeConfig?.label}</span>
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-10 h-10 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : topics.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen size={48} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No topics available yet</p>
                <button
                  onClick={() => { setSelectedTopic(null); setStep(3) }}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Show All Assessments
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* All topics option */}
                <button
                  onClick={() => { setSelectedTopic(null); setStep(3) }}
                  className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/5 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Target size={20} className="text-blue-400" />
                    <span className="text-sm font-bold text-white">All Topics</span>
                  </div>
                  <p className="text-xs text-gray-500">Browse all available assessments</p>
                </button>

                {topics.map(topic => (
                  <button
                    key={topic.name}
                    onClick={() => selectTopic(topic.name)}
                    className={`p-5 rounded-2xl border ${typeConfig?.border} hover:bg-white/5 transition-all text-left group`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">{topic.name}</span>
                      <span className="text-xs text-gray-500">{topic.question_count} Q's</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {topic.difficulties.map(d => (
                        <span key={d} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          difficultyStyles[d]?.bg || 'bg-white/5'
                        } ${difficultyStyles[d]?.text || 'text-gray-400'}`}>
                          {d}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Select Difficulty */}
        {step === 3 && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Select Difficulty</h2>
              <p className="text-gray-400 text-sm">Choose your challenge level</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-2xl mx-auto">
              {/* All difficulties */}
              <button
                onClick={() => { setSelectedDifficulty(null); setStep(4) }}
                className="flex-1 p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/5 transition-all text-center"
              >
                <Zap size={28} className="text-blue-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">All Levels</h3>
                <p className="text-xs text-gray-500">Mixed difficulty</p>
              </button>

              {DIFFICULTIES.map(diff => {
                const style = difficultyStyles[diff]
                return (
                  <button
                    key={diff}
                    onClick={() => selectDifficulty(diff)}
                    className={`flex-1 p-6 rounded-2xl border ${style.border} ${style.bg} hover:scale-105 transition-all text-center`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center mx-auto mb-3`}>
                      <Target size={20} className={style.text} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{diff}</h3>
                    <p className="text-xs text-gray-500">
                      {diff === 'Easy' ? 'Fundamentals' : diff === 'Intermediate' ? 'Moderate challenge' : 'Expert level'}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 4: Assessment List */}
        {step === 4 && (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Available Assessments</h2>
              <p className="text-gray-400 text-sm">
                {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} found
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-10 h-10 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : assessments.length === 0 ? (
              <div className="text-center py-12 bg-[#1a1a2e] rounded-2xl border border-white/5">
                <BookOpen size={48} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-2">No assessments match your filters</p>
                <button
                  onClick={() => setStep(1)}
                  className="text-blue-400 text-sm hover:underline"
                >
                  Start over
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {assessments.map(a => {
                  const canAttempt = a.can_attempt !== false
                  const isProctored = a.exam_type === 'proctored'
                  return (
                    <div
                      key={a.id}
                      className={`bg-[#1a1a2e] border rounded-2xl p-6 transition-all ${
                        canAttempt
                          ? 'border-white/5 hover:border-white/10'
                          : 'border-red-500/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-base font-bold text-white">{a.title}</h3>
                            {isProctored && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                                <Shield size={10} className="text-amber-400" />
                                <span className="text-[10px] text-amber-400 font-semibold">PROCTORED</span>
                              </span>
                            )}
                          </div>
                          {a.description && (
                            <p className="text-sm text-gray-400 mb-3 line-clamp-2">{a.description}</p>
                          )}
                          <div className="flex items-center flex-wrap gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {a.duration_minutes || 60} min
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen size={12} /> {a.question_count || a.questions || '?'} questions
                            </span>
                            <span className={`px-2 py-0.5 rounded-full ${
                              difficultyStyles[a.difficulty]?.bg || 'bg-white/5'
                            } ${difficultyStyles[a.difficulty]?.text || 'text-gray-400'}`}>
                              {a.difficulty || 'Mixed'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users size={12} />
                              {a.attempts_used || 0}/{a.max_attempts || 1} attempts
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          {canAttempt ? (
                            <button
                              onClick={() => startAssessment(a)}
                              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                a.has_in_progress
                                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                  : `bg-gradient-to-r ${typeConfig?.gradient || 'from-blue-500 to-cyan-500'} text-white hover:shadow-lg hover:shadow-blue-500/20`
                              }`}
                            >
                              {a.has_in_progress ? 'Resume' : 'Start'}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 text-red-400 text-xs">
                              <Lock size={12} />
                              <span>Limit Reached</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
