import { ArrowRight, Clock, HelpCircle } from 'lucide-react'
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

  const handleClick = () => {
    if (isComingSoon) return
    const cat = assessment.category.toLowerCase()
    navigate(`/assessments/${cat}`)
  }

  return (
    <div
      className={`group bg-surface-lowest rounded-xl p-6 transition-all duration-300 hover:translate-y-[-2px] ${
        isComingSoon ? 'opacity-60' : 'cursor-pointer'
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

      {/* Content */}
      <h3 className="text-base font-semibold text-on-surface mb-2 leading-snug">
        {assessment.title}
      </h3>
      <p className="text-sm text-on-surface-variant leading-relaxed mb-5 line-clamp-2">
        {assessment.description}
      </p>

      {/* Meta */}
      <div className="flex items-center gap-4 mb-5">
        <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Clock size={12} />
          {assessment.duration}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <HelpCircle size={12} />
          {assessment.question_count || assessment.questions} Qs
        </span>
        <span className="text-[10px] font-medium text-on-surface-variant bg-surface-high px-2 py-0.5 rounded-full">
          {assessment.category}
        </span>
      </div>

      {/* CTA */}
      {!isComingSoon && (
        <button className="btn-gradient w-full py-2.5 rounded-[10px] text-sm font-medium flex items-center justify-center gap-2 group/btn">
          View Assessments
          <ArrowRight size={14} className="transition-transform duration-200 group-hover/btn:translate-x-1" />
        </button>
      )}
    </div>
  )
}
