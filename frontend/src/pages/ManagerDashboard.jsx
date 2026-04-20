import { useState, useEffect, useRef } from 'react'
import { Users, ClipboardList, BarChart3, TrendingUp, Flame, Activity, ShieldAlert, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import Leaderboard from '../components/Leaderboard'
import api from '../services/api'

export default function ManagerDashboard() {
  const [stats, setStats] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState(null)
  const [onlineData, setOnlineData] = useState(null)
  const onlineInterval = useRef(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const results = await Promise.allSettled([
          api.get('/manager/stats'),
          api.get('/leaderboard/stats')
        ])
        // Check if manager API returned 403
        const managerFailed = results[0].status === 'rejected' && results[0].reason?.response?.status === 403
        if (managerFailed) {
          const msg = results[0].reason?.response?.data?.message || 'Your account does not have manager access.'
          setAccessError(msg)
        }
        if (results[0].status === 'fulfilled' && results[0].value?.data?.stats) {
          setStats(results[0].value.data.stats)
        }
        if (results[1].status === 'fulfilled' && results[1].value?.data) {
          setEngagement(results[1].value.data)
        }
      } catch (err) {
        console.error('Manager dashboard error:', err)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  // Poll online users every 15 seconds
  useEffect(() => {
    const fetchOnline = () => {
      api.get('/activity/online').then(r => setOnlineData(r.data)).catch(() => {})
    }
    fetchOnline()
    onlineInterval.current = setInterval(fetchOnline, 15 * 1000)
    return () => clearInterval(onlineInterval.current)
  }, [])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  if (accessError) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
      <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mb-4">
        <ShieldAlert size={28} className="text-error" />
      </div>
      <h2 className="text-lg font-bold text-on-surface mb-2">Manager Access Denied</h2>
      <p className="text-sm text-on-surface-variant max-w-md mb-1">{accessError}</p>
      <p className="text-xs text-on-surface-variant/60 max-w-md">Make sure your profile role is set to <strong>"manager"</strong> in the database. You can update it via the Supabase Dashboard → Table Editor → profiles.</p>
      <Link to="/dashboard" className="mt-4 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium no-underline hover:opacity-90 transition-opacity">Go to Dashboard</Link>
    </div>
  )

  const cards = [
    { label: 'Total Students', value: stats?.totalStudents || 0, icon: Users, color: '#1e3a8a', to: '/students' },
    { label: 'Assessments', value: stats?.totalAssessments || 0, icon: ClipboardList, color: '#00236f', to: '/assessments' },
    { label: 'Total Results', value: stats?.totalResults || 0, icon: BarChart3, color: '#166534', to: '/reports' },
    { label: 'Pass Rate', value: `${stats?.passRate || 0}%`, icon: TrendingUp, color: '#533c00' },
  ]

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Management</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Manager Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">Monitor student performance and manage assessments.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        {cards.map(card => {
          const Icon = card.icon
          const inner = (
            <div className="bg-surface-lowest rounded-xl p-6 h-full transition-all duration-200 hover:translate-y-[-2px]" style={{ boxShadow: 'var(--shadow-ambient)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${card.color}10` }}>
                <Icon size={18} style={{ color: card.color }} />
              </div>
              <p className="text-2xl font-bold text-on-surface">{card.value}</p>
              <p className="text-xs font-medium text-on-surface-variant mt-1">{card.label}</p>
            </div>
          )
          return card.to ? (
            <Link key={card.label} to={card.to} className="no-underline block">{inner}</Link>
          ) : (
            <div key={card.label}>{inner}</div>
          )
        })}
      </div>

      {/* 🟢 Active Now — Real-time online students */}
      {onlineData && onlineData.total > 0 && (
        <div className="mb-8">
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wifi size={16} className="text-[#22c55e]" />
                <h2 className="text-sm font-semibold text-on-surface">Active Now</h2>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22c55e]" />
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#166534] text-[10px] font-bold">
                {onlineData.students} student{onlineData.students !== 1 ? 's' : ''} online
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {(onlineData.users || []).filter(u => u.role === 'student').map(u => (
                <div key={u.id} className="flex items-center gap-2.5 bg-surface-low rounded-xl px-3 py-2.5 transition-all hover:bg-surface-high">
                  <div className="relative shrink-0">
                    {u.profile_url ? (
                      <img src={u.profile_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {u.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] border-2 border-surface-low" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-on-surface truncate">{u.name}</p>
                    <p className="text-[9px] text-on-surface-variant truncate">{u.department || 'Student'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Engagement + Department Stats */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Engagement Panel */}
        <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-on-surface">Platform Engagement</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-primary-fixed rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-primary">{engagement?.activeToday || 0}</p>
              <p className="text-[10px] text-primary/70 font-medium">Active Today</p>
            </div>
            <div className="bg-[#dcfce7] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#166534]">{engagement?.activeWeekly || 0}</p>
              <p className="text-[10px] text-[#166534]/70 font-medium">Active This Week</p>
            </div>
          </div>

          {/* Top Streakers — Ranked */}
          <h3 className="text-xs font-medium text-on-surface-variant mb-3">🏆 Top Streakers (Ranked)</h3>
          <div className="flex flex-col gap-2">
            {(engagement?.topStreakers || []).map((s, i) => {
              const rankColors = ['bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-white', 'bg-gradient-to-r from-[#9ca3af] to-[#6b7280] text-white', 'bg-gradient-to-r from-[#d97706] to-[#b45309] text-white']
              const rankBg = i < 3 ? rankColors[i] : 'bg-surface-high text-on-surface-variant'
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-surface-low rounded-lg">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${rankBg}`}>
                    {i + 1}
                  </span>
                  {s.profile_url ? (
                    <img src={s.profile_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#ea580c]/10 flex items-center justify-center text-[10px] font-bold text-[#ea580c] shrink-0">
                      {s.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-on-surface truncate">{s.name}</p>
                    <p className="text-[10px] text-on-surface-variant">{s.department || '—'}</p>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-[#ea580c]">
                    <Flame size={13} /> {s.current_streak || 0}
                  </span>
                </div>
              )
            })}
            {(!engagement?.topStreakers || engagement.topStreakers.length === 0) && (
              <p className="text-xs text-on-surface-variant text-center py-3">No streaks yet</p>
            )}
          </div>
        </div>

        {/* Department Distribution + Performance */}
        <div className="flex flex-col gap-6">
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <h2 className="text-sm font-semibold text-on-surface mb-4">Students by Department</h2>
            <div className="space-y-3">
              {(stats?.departmentStats || []).map(dept => (
                <div key={dept.department}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-on-surface-variant">{dept.department}</span>
                    <span className="text-xs font-semibold text-on-surface">{dept.count}</span>
                  </div>
                  <div className="w-full h-2 bg-surface-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-700"
                      style={{ width: `${stats?.totalStudents ? (dept.count / stats.totalStudents) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              {(!stats?.departmentStats || stats.departmentStats.length === 0) && (
                <p className="text-xs text-on-surface-variant">No department data yet.</p>
              )}
            </div>
          </div>

          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <h2 className="text-sm font-semibold text-on-surface mb-4">Performance Overview</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-primary-fixed rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-primary">{stats?.avgScore || 0}%</p>
                <p className="text-[10px] text-primary/70 font-medium">Avg Score</p>
              </div>
              <div className="bg-[#dcfce7] rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-[#166534]">{stats?.passRate || 0}%</p>
                <p className="text-[10px] text-[#166534]/70 font-medium">Pass Rate</p>
              </div>
              <div className="bg-surface-high rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-on-surface">{stats?.totalResults || 0}</p>
                <p className="text-[10px] text-on-surface-variant font-medium">Total Attempts</p>
              </div>
              <div className="bg-surface-high rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-on-surface">{stats?.activeAssessments || 0}</p>
                <p className="text-[10px] text-on-surface-variant font-medium">Active Tests</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <Leaderboard />
      </div>
    </div>
  )
}
