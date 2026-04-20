import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2, XCircle, Clock, Filter, Search, ChevronDown } from 'lucide-react'
import api from '../services/api'

const categories = ['All', 'Aptitude', 'Coding', 'Communication']

export default function Results() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')

  useEffect(() => {
    async function fetchResults() {
      try {
        const { data } = await api.get('/results')
        setResults(data.results || [])
      } catch (err) {
        console.error('Results fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [])

  const filtered = useMemo(() => {
    let data = [...results]

    if (categoryFilter !== 'All') {
      data = data.filter((r) => r.category === categoryFilter)
    }

    if (search) {
      data = data.filter((r) => r.assessment_title.toLowerCase().includes(search.toLowerCase()))
    }

    if (sortBy === 'date') {
      data.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    } else if (sortBy === 'score') {
      data.sort((a, b) => b.percentage - a.percentage)
    }

    return data
  }, [results, categoryFilter, search, sortBy])

  const getScoreColor = (pct) => {
    if (pct >= 80) return 'text-[#166534]'
    if (pct >= 60) return 'text-primary'
    return 'text-error'
  }

  const getScoreBg = (pct) => {
    if (pct >= 80) return 'bg-[#dcfce7]'
    if (pct >= 60) return 'bg-primary-fixed'
    return 'bg-error-container'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Evaluation Records</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Assessment Results</h1>
        <p className="text-sm text-on-surface-variant mt-1">Review your assessment history, scores, and detailed performance.</p>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[#dcfce7] rounded-xl p-5 text-center">
          <p className="text-2xl font-bold text-[#166534]">{results.filter((r) => r.status === 'passed').length}</p>
          <p className="text-xs text-[#166534]/70 font-medium mt-1">Passed</p>
        </div>
        <div className="bg-error-container rounded-xl p-5 text-center">
          <p className="text-2xl font-bold text-error">{results.filter((r) => r.status === 'failed').length}</p>
          <p className="text-xs text-error/70 font-medium mt-1">Failed</p>
        </div>
        <div className="bg-primary-fixed rounded-xl p-5 text-center">
          <p className="text-2xl font-bold text-primary">{results.length}</p>
          <p className="text-xs text-primary/70 font-medium mt-1">Total Attempts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-lowest rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4" style={{ boxShadow: 'var(--shadow-ambient-sm)' }}>
        <div className="flex items-center gap-2 bg-surface-low rounded-lg px-3 py-2 flex-1 w-full sm:w-auto">
          <Search size={14} className="text-on-surface-variant shrink-0" />
          <input
            type="text"
            placeholder="Search assessments..."
            className="bg-transparent outline-none text-sm text-on-surface placeholder:text-outline w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-on-surface-variant" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
                categoryFilter === cat
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-high'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="appearance-none bg-surface-low rounded-lg px-3 py-2 pr-8 text-xs font-medium text-on-surface-variant outline-none cursor-pointer"
          >
            <option value="date">Sort by Date</option>
            <option value="score">Sort by Score</option>
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        </div>
      </div>

      {/* Results List */}
      <div className="flex flex-col gap-3 stagger-children">
        {filtered.length === 0 ? (
          <div className="bg-surface-lowest rounded-xl p-12 text-center" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <p className="text-sm text-on-surface-variant">No results found.</p>
          </div>
        ) : (
          filtered.map((result) => (
            <div
              key={result.id}
              className="bg-surface-lowest rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-200 hover:translate-y-[-1px]"
              style={{ boxShadow: 'var(--shadow-ambient)' }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                result.status === 'passed' ? 'bg-[#dcfce7]' : 'bg-error-container'
              }`}>
                {result.status === 'passed' ? (
                  <CheckCircle2 size={18} className="text-[#166534]" />
                ) : (
                  <XCircle size={18} className="text-error" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-on-surface mb-0.5">{result.assessment_title}</h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-high text-on-surface-variant">
                    {result.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <Clock size={11} />
                    {result.duration}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {new Date(result.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-on-surface-variant mb-0.5">Score</p>
                  <p className="text-sm font-semibold text-on-surface">{result.score}/{result.total}</p>
                </div>
                <div className={`px-3 py-1.5 rounded-lg text-center min-w-[60px] ${getScoreBg(result.percentage)}`}>
                  <p className={`text-lg font-bold ${getScoreColor(result.percentage)}`}>
                    {result.percentage}%
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
