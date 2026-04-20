import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, Calendar, Filter } from 'lucide-react'
import api from '../services/api'

const dateRanges = ['Last 3 Months', 'Last 6 Months', 'All Time']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null
  return (
    <div className="bg-surface-lowest rounded-xl p-4" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
      <p className="text-xs font-semibold text-on-surface mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-xs text-on-surface-variant capitalize">{entry.dataKey}:</span>
          <span className="text-xs font-semibold text-on-surface">{entry.value}%</span>
        </div>
      ))}
    </div>
  )
}

export default function Performance() {
  const [range, setRange] = useState('Last 6 Months')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data } = await api.get('/results/stats')
        setStats(data.stats)
      } catch (err) {
        console.error('Performance fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const performanceData = stats?.performanceData || []
  const categoryData = stats?.categoryBreakdown || []

  const filteredData = useMemo(() => {
    if (range === 'Last 3 Months') return performanceData.slice(-3)
    if (range === 'Last 6 Months') return performanceData.slice(-6)
    return performanceData
  }, [range, performanceData])

  const summaryCards = categoryData.map((cat) => ({
    label: cat.category,
    current: cat.average,
    prev: Math.max(0, cat.average - 5), // approx prev
    color: cat.category === 'Aptitude' ? '#1e3a8a' : cat.category === 'Coding' ? '#00236f' : '#533c00'
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Analytics</p>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Performance Reports</h1>
          <p className="text-sm text-on-surface-variant mt-1">Track your assessment progress and growth trends.</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-on-surface-variant" />
          {dateRanges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ${
                range === r
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 stagger-children">
        {summaryCards.length > 0 ? summaryCards.map((card) => {
          const change = card.current - card.prev
          return (
            <div key={card.label} className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">{card.label}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  change >= 0 ? 'bg-[#dcfce7] text-[#166534]' : 'bg-error-container text-error'
                }`}>
                  {change >= 0 ? '+' : ''}{change}%
                </span>
              </div>
              <p className="text-3xl font-bold text-on-surface mb-1">{card.current}%</p>
              <div className="w-full h-1.5 bg-surface-high rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${card.current}%`, background: card.color }}
                />
              </div>
            </div>
          )
        }) : (
          <div className="col-span-3 text-center py-12">
            <p className="text-sm text-on-surface-variant">No performance data yet. Take an assessment to see your stats.</p>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      {filteredData.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Progress Over Time */}
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-on-surface">Progress Over Time</h2>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="gradAptitude" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradCoding" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00236f" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#00236f" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradComm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f9bd22" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#f9bd22" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e8e9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#757682' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#757682' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="aptitude" stroke="#1e3a8a" strokeWidth={2} fillOpacity={1} fill="url(#gradAptitude)" />
                <Area type="monotone" dataKey="coding" stroke="#00236f" strokeWidth={2} fillOpacity={1} fill="url(#gradCoding)" />
                <Area type="monotone" dataKey="communication" stroke="#f9bd22" strokeWidth={2} fillOpacity={1} fill="url(#gradComm)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Category Breakdown */}
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-6">
              <Calendar size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-on-surface">Category Breakdown</h2>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e8e9" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#757682' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#757682' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="average" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Trend Line */}
      {filteredData.length > 0 && (
        <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
          <h2 className="text-sm font-semibold text-on-surface mb-6">Overall Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e8e9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#757682' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#757682' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="aptitude" stroke="#1e3a8a" strokeWidth={2.5} dot={{ fill: '#1e3a8a', r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="coding" stroke="#00236f" strokeWidth={2.5} dot={{ fill: '#00236f', r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="communication" stroke="#f9bd22" strokeWidth={2.5} dot={{ fill: '#f9bd22', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
