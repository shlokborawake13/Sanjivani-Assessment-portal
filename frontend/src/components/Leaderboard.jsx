import { useState, useEffect } from 'react'
import { Trophy, Flame, Crown, Medal, ChevronDown, Brain, Code, MessageCircle, Star } from 'lucide-react'
import api from '../services/api'

const CATEGORIES = [
  { key: 'overall', label: 'Overall', icon: Trophy },
  { key: 'aptitude', label: 'Aptitude', icon: Brain },
  { key: 'coding', label: 'Coding', icon: Code },
  { key: 'communication', label: 'Communication', icon: MessageCircle },
  { key: 'streak', label: 'Streaks', icon: Flame },
]

const RANK_STYLES = {
  1: { bg: 'bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]', text: 'text-white', icon: Crown, label: '🥇' },
  2: { bg: 'bg-gradient-to-r from-[#9ca3af] to-[#6b7280]', text: 'text-white', icon: Medal, label: '🥈' },
  3: { bg: 'bg-gradient-to-r from-[#d97706] to-[#b45309]', text: 'text-white', icon: Medal, label: '🥉' },
}

export default function Leaderboard({ compact = false }) {
  const [data, setData] = useState({ leaderboard: [], departments: [], userEntry: null })
  const [category, setCategory] = useState('streak')
  const [department, setDepartment] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (department && department !== 'All') params.set('department', department)
    if (compact) params.set('limit', '10')

    api.get(`/leaderboard?${params}`)
      .then(res => setData(res.data))
      .catch(err => console.error('Leaderboard fetch error:', err))
      .finally(() => setLoading(false))
  }, [category, department, compact])

  const getScoreForCategory = (entry) => {
    switch (category) {
      case 'aptitude': return `${entry.aptitude_score}%`
      case 'coding': return `${entry.coding_score}%`
      case 'communication': return `${entry.communication_score}%`
      case 'streak': return `${entry.streak} 🔥`
      default: return `${entry.avg_percentage || entry.overall_score}%`
    }
  }

  const getSubtext = (entry) => {
    if (category === 'streak') return `Best: ${entry.max_streak}`
    return `${entry.total_attempts || entry.problems_solved || 0} attempts`
  }

  const entries = data.leaderboard || []
  const topThree = entries.slice(0, 3)
  const rest = compact ? entries.slice(3, 10) : entries.slice(3)

  return (
    <div className="bg-surface-lowest rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-ambient)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={18} className="text-accent" />
          <h2 className="text-base font-bold text-on-surface">Leaderboard</h2>
        </div>
        <p className="text-xs text-on-surface-variant">Top performers across the platform</p>
      </div>

      {/* Category Tabs */}
      <div className="px-6 mb-4">
        <div className="flex gap-1 p-1 bg-surface-low rounded-xl overflow-x-auto">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const isActive = category === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-surface-lowest text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon size={13} />
                {!compact && cat.label}
                {compact && cat.label.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Department Filter */}
      {!compact && data.departments?.length > 0 && (
        <div className="px-6 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">Department:</span>
            <div className="relative">
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="appearance-none bg-surface-low text-xs font-medium text-on-surface px-3 py-1.5 pr-7 rounded-lg border-none cursor-pointer outline-none"
              >
                <option value="All">All Departments</option>
                {data.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Star size={32} className="text-on-surface-variant/30 mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">No leaderboard data yet.</p>
          <p className="text-xs text-on-surface-variant/60 mt-1">Complete assessments to appear here!</p>
        </div>
      ) : (
        <>
          {/* Podium - Top 3 */}
          {!compact && topThree.length > 0 && (
            <div className="px-6 mb-4">
              <div className="flex items-end justify-center gap-3">
                {/* 2nd Place */}
                {topThree[1] && (
                  <div className="flex flex-col items-center flex-1 max-w-[120px]">
                    <div className="relative mb-2">
                      {topThree[1].profile_url ? (
                        <img src={topThree[1].profile_url} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#9ca3af]" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#9ca3af] to-[#6b7280] flex items-center justify-center text-white font-bold text-lg ring-2 ring-[#9ca3af]">
                          {topThree[1].name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-lg">🥈</span>
                    </div>
                    <p className="text-xs font-semibold text-on-surface truncate w-full text-center">{topThree[1].name?.split(' ')[0]}</p>
                    <p className="text-[10px] text-on-surface-variant">{getScoreForCategory(topThree[1])}</p>
                    <div className="w-full h-16 bg-gradient-to-t from-[#9ca3af]/20 to-transparent rounded-t-lg mt-2" />
                  </div>
                )}
                {/* 1st Place */}
                {topThree[0] && (
                  <div className="flex flex-col items-center flex-1 max-w-[130px]">
                    <div className="relative mb-2">
                      {topThree[0].profile_url ? (
                        <img src={topThree[0].profile_url} alt="" className="w-16 h-16 rounded-full object-cover ring-3 ring-[#fbbf24]" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] flex items-center justify-center text-white font-bold text-xl ring-3 ring-[#fbbf24]">
                          {topThree[0].name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-xl">🥇</span>
                    </div>
                    <Crown size={16} className="text-[#fbbf24] mb-1" />
                    <p className="text-sm font-bold text-on-surface truncate w-full text-center">{topThree[0].name?.split(' ')[0]}</p>
                    <p className="text-xs text-accent font-semibold">{getScoreForCategory(topThree[0])}</p>
                    <div className="w-full h-24 bg-gradient-to-t from-[#fbbf24]/20 to-transparent rounded-t-lg mt-2" />
                  </div>
                )}
                {/* 3rd Place */}
                {topThree[2] && (
                  <div className="flex flex-col items-center flex-1 max-w-[120px]">
                    <div className="relative mb-2">
                      {topThree[2].profile_url ? (
                        <img src={topThree[2].profile_url} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#d97706]" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#d97706] to-[#b45309] flex items-center justify-center text-white font-bold text-lg ring-2 ring-[#d97706]">
                          {topThree[2].name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-lg">🥉</span>
                    </div>
                    <p className="text-xs font-semibold text-on-surface truncate w-full text-center">{topThree[2].name?.split(' ')[0]}</p>
                    <p className="text-[10px] text-on-surface-variant">{getScoreForCategory(topThree[2])}</p>
                    <div className="w-full h-12 bg-gradient-to-t from-[#d97706]/20 to-transparent rounded-t-lg mt-2" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* List */}
          <div className="px-4 pb-4">
            <div className="bg-surface-low rounded-xl overflow-hidden">
              {/* Header Row */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-outline-variant/30">
                <span className="col-span-1 text-[10px] font-semibold text-on-surface-variant uppercase">#</span>
                <span className="col-span-4 text-[10px] font-semibold text-on-surface-variant uppercase">Student</span>
                <span className="col-span-3 text-[10px] font-semibold text-on-surface-variant uppercase truncate">Department</span>
                <span className="col-span-2 text-[10px] font-semibold text-on-surface-variant uppercase text-center">Streak</span>
                <span className="col-span-2 text-[10px] font-semibold text-on-surface-variant uppercase text-right">Score</span>
              </div>

              {/* Compact: show all including top 3 in the list */}
              {(compact ? entries : rest).map((entry) => {
                const rankStyle = RANK_STYLES[entry.rank]
                return (
                  <div
                    key={entry.id}
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-mid/30 transition-colors"
                  >
                    {/* Rank */}
                    <div className="col-span-1">
                      {rankStyle ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${rankStyle.bg} ${rankStyle.text}`}>
                          {entry.rank}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-on-surface-variant">{entry.rank}</span>
                      )}
                    </div>

                    {/* Student Info */}
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      {entry.profile_url ? (
                        <img src={entry.profile_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full btn-gradient flex items-center justify-center text-[10px] font-bold text-on-primary shrink-0">
                          {entry.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-on-surface truncate">{entry.name}</p>
                        <p className="text-[10px] text-on-surface-variant truncate">{entry.prn || '—'}</p>
                      </div>
                    </div>

                    {/* Department */}
                    <div className="col-span-3 flex items-center">
                      <span className="text-[10px] font-medium text-on-surface-variant bg-surface-high px-2 py-0.5 rounded-md truncate max-w-full" title={entry.department}>
                        {entry.department || '—'}
                      </span>
                    </div>

                    {/* Streak */}
                    <div className="col-span-2 text-center">
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold">
                        <Flame size={12} className={entry.streak > 0 ? 'text-[#ea580c]' : 'text-on-surface-variant/30'} />
                        <span className={entry.streak > 0 ? 'text-[#ea580c]' : 'text-on-surface-variant'}>{entry.streak}</span>
                      </span>
                    </div>

                    {/* Score */}
                    <div className="col-span-2 text-right">
                      <span className="text-xs font-bold text-primary">{getScoreForCategory(entry)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Current User Position (if not in visible list) */}
          {data.userEntry && !entries.find(e => e.id === data.userEntry.id) && (
            <div className="px-4 pb-4">
              <div className="bg-primary-fixed/50 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">#{data.userEntry.rank}</span>
                  <span className="text-xs font-semibold text-on-surface">You</span>
                  <span className="text-xs text-on-surface-variant ml-auto">{data.userEntry.overall_score}%</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
