import { ArrowRight, Clock, HelpCircle, Shield, Lock } from 'lucide-react'
import { Brain, Code, MessageCircle, Settings, BookOpen, Target, Lightbulb } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const categoryConfig = {
  'Aptitude': { icon: Brain, color: '#1e3a8a' },
  'Coding': { icon: Code, color: '#166534' },
  'Communication': { icon: MessageCircle, color: '#7c2d12' },
  'Technical': { icon: Settings, color: '#533c00' },
  'Reasoning': { icon: Lightbulb, color: '#4338ca' },
  'General Knowledge': { icon: BookOpen, color: '#0e7490' },
  'Quantitative': { icon: Target, color: '#9333ea' },
}

const defaultConfig = { icon: HelpCircle, color: '#00236f' }

export default function AssessmentCard({ assessment }) {
  const navigate = useNavigate()
  const config = categoryConfig[assessment.category] || defaultConfig
  const Icon = config.icon
  const color = config.color
  const isComingSoon = assessment.status === 'coming_soon'
  const canAttempt = assessment.can_attempt !== false
  const hasInProgress = assessment.has_in_progress
  const attemptsUsed = assessment.attempts_used || 0
  const maxAttempts = assessment.max_attempts || 1
  const isProctored = assessment.exam_type === 'proctored'

  const handleClick = () => {
    if (isComingSoon || !canAttempt) return
    const cat = (assessment.category || '').toLowerCase()
    if (cat === 'coding') {
      navigate(`/assessment/${assessment.id}/code`)
    } else if (cat === 'communication') {
      navigate(`/assessment/${assessment.id}/communicate`)
    } else {
      navigate(`/assessment/${assessment.id}/take`)
    }
  }

  return (
    <div
      className={`group bg-surface-lowest rounded-xl p-6 transition-all duration-300 hover:translate-y-[-2px] ${
        isComingSoon || !canAttempt ? 'opacity-60' : 'cursor-pointer'
      }`}
      style={{ boxShadow: 'var(--shadow-ambient)' }}
      onClick={handleClick}
    >
      {/* Icon + Badge */}
      <div className="flex items-start justify-between mb-5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
          style={{ background: `${color}12` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        <div className="flex items-center gap-1.5">
          {isProctored && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
              <Shield size={10} />
            </span>
          )}
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${
              isComingSoon
                ? 'bg-surface-high text-on-surface-variant'
                : 'bg-primary-fixed text-primary'
            }`}
          >
            {isComingSoon ? 'Coming Soon' : assessment.difficulty}
          </span>
        </div>
      </div>

      {/* Content */}
      <h3 className="text-base font-semibold text-on-surface mb-2 leading-snug">
        {assessment.title}
      </h3>
      <p className="text-sm text-on-surface-variant leading-relaxed mb-4 line-clamp-2">
        {assessment.description}
      </p>

      {/* Meta */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Clock size={12} />
          {assessment.duration_minutes || parseInt((assessment.duration || '60').match(/(\d+)/)?.[1]) || 60} min
        </span>
        <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <HelpCircle size={12} />
          {assessment.question_count || assessment.questions || 0} Qs
        </span>
        <span className="text-[10px] font-medium text-on-surface-variant bg-surface-high px-2 py-0.5 rounded-full">
          {assessment.category}
        </span>
      </div>

      {/* Attempt count */}
      {maxAttempts > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] text-on-surface-variant">
            {attemptsUsed}/{maxAttempts} attempt{maxAttempts > 1 ? 's' : ''} used
          </span>
          {/* Progress bar */}
          <div className="w-16 h-1 bg-surface-high rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${attemptsUsed >= maxAttempts ? 'bg-error' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, (attemptsUsed / maxAttempts) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      {isComingSoon ? null : !canAttempt ? (
        <div className="w-full py-2.5 rounded-[10px] text-sm font-medium flex items-center justify-center gap-2 bg-surface-high text-on-surface-variant">
          <Lock size={14} /> No attempts remaining
        </div>
      ) : hasInProgress ? (
        <button className="btn-gradient w-full py-2.5 rounded-[10px] text-sm font-medium flex items-center justify-center gap-2 group/btn">
          Resume Assessment
          <ArrowRight size={14} className="transition-transform duration-200 group-hover/btn:translate-x-1" />
        </button>
      ) : (
        <button className="btn-gradient w-full py-2.5 rounded-[10px] text-sm font-medium flex items-center justify-center gap-2 group/btn">
          Start Assessment
          <ArrowRight size={14} className="transition-transform duration-200 group-hover/btn:translate-x-1" />
        </button>
      )}
    </div>
  )
}
