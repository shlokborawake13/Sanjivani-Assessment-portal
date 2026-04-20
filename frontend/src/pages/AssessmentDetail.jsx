import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Clock, BarChart3, ArrowRight } from 'lucide-react'
import api from '../services/api'

const FILTERS = ['Expired', 'Active', 'Upcoming']
const LEVELS = ['All', 'Beginner', 'Intermediate', 'Advanced']

export default function AssessmentDetail() {
  const { category } = useParams()
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('Active')
  const [levelFilter, setLevelFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [attempts, setAttempts] = useState({})

  useEffect(() => {
    async function fetchData() {
      try {
        const [assessRes, attemptsRes] = await Promise.allSettled([
          api.get('/assessments'),
          api.get('/attempts')
        ])
        
        if (assessRes.status === 'fulfilled') {
          const all = assessRes.value.data.assessments || []
          const filtered = category === 'all'
            ? all
            : all.filter(a => a.category.toLowerCase() === category.toLowerCase())
          setAssessments(filtered)
        }

        // Build attempts map: assessment_id -> latest attempt
        const attMap = {}
        if (attemptsRes.status === 'fulfilled') {
          ;(attemptsRes.value.data.attempts || []).forEach(att => {
            if (!attMap[att.assessment_id] || new Date(att.created_at) > new Date(attMap[att.assessment_id].created_at)) {
              attMap[att.assessment_id] = att
            }
          })
        }
        setAttempts(attMap)
      } catch (err) {
        console.error('Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [category])

  const now = new Date()
  const filteredAssessments = assessments.filter(a => {
    // Status filter
    if (activeFilter === 'Expired') {
      if (!a.expires_at || new Date(a.expires_at) > now) return false
    } else if (activeFilter === 'Active') {
      if (a.status !== 'available') return false
      if (a.expires_at && new Date(a.expires_at) < now) return false
    } else if (activeFilter === 'Upcoming') {
      if (a.status !== 'coming_soon') return false
    }
    // Level filter
    if (levelFilter !== 'All' && a.difficulty !== levelFilter) return false
    // Search filter
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const getCategoryColor = (cat) => {
    const colors = {
      'Aptitude': 'from-[#ea580c] to-[#f97316]',
      'Coding': 'from-[#0ea5e9] to-[#38bdf8]',
      'Communication': 'from-[#ea580c] to-[#f97316]',
      'Technical': 'from-[#7c3aed] to-[#a78bfa]',
    }
    return colors[cat] || 'from-[#ea580c] to-[#f97316]'
  }

  const handleStart = (assessment) => {
    const attempt = attempts[assessment.id]
    if (assessment.category.toLowerCase() === 'coding') {
      navigate(`/assessment/${assessment.id}/code`)
    } else if (assessment.category.toLowerCase() === 'communication') {
      navigate(`/assessment/${assessment.id}/communicate`)
    } else {
      navigate(`/assessment/${assessment.id}/take`)
    }
  }

  const categoryTitle = category === 'all'
    ? 'All Assessments'
    : `${category.charAt(0).toUpperCase() + category.slice(1)}+ Package`

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft size={16} />
          Back
        </button>
        <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {categoryTitle}
        </h1>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-6 mb-6">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`text-sm font-medium pb-1 transition-colors ${
              activeFilter === f
                ? 'text-on-surface border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {f === 'Active' ? (
              <span className="bg-[#dcfce7] text-[#166534] px-3 py-1 rounded-full text-xs font-semibold">{f}</span>
            ) : f}
          </button>
        ))}
      </div>

      {/* Search + Level Filter */}
      <div className="flex items-center justify-between mb-8 gap-4">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-minimal !pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant whitespace-nowrap">Filter by Level</span>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="input-minimal text-sm min-w-[100px] cursor-pointer"
          >
            {LEVELS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Assessment Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {filteredAssessments.map(a => {
          const attempt = attempts[a.id]
          const hasAttempt = attempt?.status === 'in_progress'
          const gradient = getCategoryColor(a.category)

          return (
            <div
              key={a.id}
              className="rounded-2xl overflow-hidden transition-all duration-300 hover:translate-y-[-3px] hover:shadow-xl group"
              style={{ boxShadow: 'var(--shadow-ambient)' }}
            >
              {/* Card Top — Gradient section */}
              <div className={`bg-gradient-to-br ${gradient} p-5 pb-4 relative`}>
                <h3 className="text-white font-bold text-base mb-2 leading-snug">{a.title}</h3>
                {a.expires_at && (
                  <p className="text-white/80 text-xs mb-3">
                    Expires on: {new Date(a.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
                <span className="inline-block bg-white/20 backdrop-blur-sm text-white text-[10px] font-semibold px-3 py-1 rounded-full border border-white/30">
                  {a.type || 'Practice'}
                </span>

                {/* Avatar decoration */}
                <div className="absolute bottom-3 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <BarChart3 size={16} className="text-white/80" />
                </div>
              </div>

              {/* Card Bottom — White section */}
              <div className="bg-surface-lowest p-5 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-0.5">
                    <span className="w-1 h-2.5 bg-primary/30 rounded-full" />
                    <span className="w-1 h-3.5 bg-primary/60 rounded-full" />
                    <span className="w-1 h-4.5 bg-primary rounded-full" />
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    {a.level || 'Beginner, Intermediate, Advanced'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-4 line-clamp-2">
                  {a.description || `This practice comprises a set of MCQs designed to assess all ${a.category} topics.`}
                </p>

                <button
                  onClick={() => handleStart(a)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                    hasAttempt
                      ? 'bg-gradient-to-r from-primary to-primary-container text-white'
                      : 'bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white hover:shadow-lg'
                  }`}
                >
                  {hasAttempt ? 'Continue' : 'Get Started'}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          )
        })}

        {filteredAssessments.length === 0 && (
          <div className="col-span-full text-center py-16">
            <p className="text-sm text-on-surface-variant">No assessments found for this filter.</p>
          </div>
        )}
      </div>
    </div>
  )
}
