import { useState, useEffect, useRef } from 'react'
import { Users, ClipboardList, BarChart3, HeadphonesIcon, Flame, Activity, ShieldAlert, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'
import Leaderboard from '../components/Leaderboard'
import api from '../services/api'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [recentUsers, setRecentUsers] = useState([])
  const [recentTickets, setRecentTickets] = useState([])
  const [engagement, setEngagement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState(null)
  const [onlineData, setOnlineData] = useState(null)
  const onlineInterval = useRef(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const results = await Promise.allSettled([
          api.get('/admin/stats'),
          api.get('/admin/users'),
          api.get('/support'),
          api.get('/leaderboard/stats')
        ])
        // Check if admin APIs returned 403 (role mismatch)
        const adminFailed = results[0].status === 'rejected' && results[0].reason?.response?.status === 403
        if (adminFailed) {
          const msg = results[0].reason?.response?.data?.message || 'Your account does not have admin access.'
          setAccessError(msg)
        }

        // Store full users list — single source of truth
        const fetchedUsers = (results[1].status === 'fulfilled' && results[1].value?.data?.users) || []
        setAllUsers(fetchedUsers)
        setRecentUsers(fetchedUsers.slice(0, 5))

        // Debug: log user count
        console.log(`[AdminDashboard] Fetched ${fetchedUsers.length} users from /admin/users`)

        if (results[0].status === 'fulfilled' && results[0].value?.data?.stats) {
          const apiStats = results[0].value.data.stats
          console.log(`[AdminDashboard] Stats API returned totalUsers=${apiStats.totalUsers}`)

          // If stats API returned 0 for totalUsers but we have users, compute from users list
          if (apiStats.totalUsers === 0 && fetchedUsers.length > 0) {
            console.warn(`[AdminDashboard] Stats totalUsers=0 but fetched ${fetchedUsers.length} users — using users list as fallback`)
            apiStats.totalUsers = fetchedUsers.length
            apiStats.totalStudents = fetchedUsers.filter(u => u.role === 'student').length
            apiStats.totalManagers = fetchedUsers.filter(u => u.role === 'manager').length
            apiStats.totalAdmins = fetchedUsers.filter(u => u.role === 'admin').length
          }
          setStats(apiStats)
        } else if (fetchedUsers.length > 0) {
          // Stats API failed entirely — compute from users list
          console.warn(`[AdminDashboard] Stats API failed, computing from ${fetchedUsers.length} users`)
          setStats({
            totalUsers: fetchedUsers.length,
            totalStudents: fetchedUsers.filter(u => u.role === 'student').length,
            totalManagers: fetchedUsers.filter(u => u.role === 'manager').length,
            totalAdmins: fetchedUsers.filter(u => u.role === 'admin').length,
            totalAssessments: 0, activeAssessments: 0,
            totalResults: 0, avgScore: 0, passRate: 0,
            totalTickets: 0, openTickets: 0,
          })
        }

        if (results[2].status === 'fulfilled' && results[2].value?.data?.tickets) {
          setRecentTickets((results[2].value.data.tickets || []).slice(0, 4))
        }
        if (results[3].status === 'fulfilled' && results[3].value?.data) {
          setEngagement(results[3].value.data)
        }
      } catch (err) {
        console.error('Admin dashboard error:', err)
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
      <h2 className="text-lg font-bold text-on-surface mb-2">Admin Access Denied</h2>
      <p className="text-sm text-on-surface-variant max-w-md mb-1">{accessError}</p>
      <p className="text-xs text-on-surface-variant/60 max-w-md">Make sure your profile role is set to <strong>"admin"</strong> in the database. You can update it via the Supabase Dashboard → Table Editor → profiles.</p>
      <Link to="/dashboard" className="mt-4 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium no-underline hover:opacity-90 transition-opacity">Go to Dashboard</Link>
    </div>
  )

  const cards = [
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: '#1e3a8a', sub: `${stats?.totalStudents || 0} students, ${stats?.totalManagers || 0} managers`, to: '/users' },
    { label: 'Assessments', value: stats?.totalAssessments || 0, icon: ClipboardList, color: '#00236f', sub: `${stats?.activeAssessments || 0} active`, to: '/assessments' },
    { label: 'Total Results', value: stats?.totalResults || 0, icon: BarChart3, color: '#166534', sub: `Avg ${stats?.avgScore || 0}%, Pass rate ${stats?.passRate || 0}%`, to: null },
    { label: 'Support Tickets', value: stats?.totalTickets || 0, icon: HeadphonesIcon, color: '#533c00', sub: `${stats?.openTickets || 0} open`, to: '/admin/support' },
  ]

  const ticketStatusColors = {
    open: 'bg-error-container text-error',
    in_progress: 'bg-[#fef3c7] text-[#92400e]',
    resolved: 'bg-[#dcfce7] text-[#166534]',
    closed: 'bg-surface-high text-on-surface-variant'
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Administration</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Admin Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">Overview of the entire assessment portal.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        {cards.map((card) => {
          const Icon = card.icon
          const inner = (
            <div className="bg-surface-lowest rounded-xl p-6 h-full transition-all duration-200 hover:translate-y-[-2px]" style={{ boxShadow: 'var(--shadow-ambient)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${card.color}10` }}>
                  <Icon size={18} style={{ color: card.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-on-surface">{card.value}</p>
              <p className="text-xs font-medium text-on-surface-variant mt-1">{card.label}</p>
              <p className="text-[10px] text-on-surface-variant/70 mt-0.5">{card.sub}</p>
            </div>
          )
          return card.to ? (
            <Link key={card.label} to={card.to} className="no-underline block">{inner}</Link>
          ) : (
            <div key={card.label}>{inner}</div>
          )
        })}
      </div>

      {/* 🟢 Active Now — Real-time online users */}
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
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#166534] text-[10px] font-bold">
                  {onlineData.students} student{onlineData.students !== 1 ? 's' : ''}
                </span>
                {onlineData.managers > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-[#fef3c7] text-[#92400e] text-[10px] font-bold">
                    {onlineData.managers} manager{onlineData.managers !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full bg-primary-fixed text-primary text-[10px] font-bold">
                  {onlineData.total} online
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {(onlineData.users || []).map(u => (
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
                    <p className="text-[9px] text-on-surface-variant truncate">{u.department || u.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Engagement Stats */}
      {engagement && (
        <div className="mb-8">
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-accent" />
              <h2 className="text-sm font-semibold text-on-surface">Daily Platform Engagement</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-primary-fixed rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-primary">{engagement.activeToday || 0}</p>
                <p className="text-[10px] text-primary/70 font-medium">Active Today</p>
              </div>
              <div className="bg-[#dcfce7] rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-[#166534]">{engagement.activeWeekly || 0}</p>
                <p className="text-[10px] text-[#166534]/70 font-medium">Active This Week</p>
              </div>
              <div className="bg-[#fef3c7] rounded-xl p-4 text-center col-span-2">
                <h3 className="text-[10px] font-semibold text-[#92400e]/70 mb-2 uppercase tracking-wider">🏆 Top Streakers (Ranked)</h3>
                <div className="flex items-center justify-center gap-3">
                  {(engagement.topStreakers || []).slice(0, 5).map((s, i) => {
                    const rankColors = ['ring-[#fbbf24]', 'ring-[#9ca3af]', 'ring-[#d97706]']
                    const medals = ['🥇', '🥈', '🥉']
                    return (
                      <div key={i} className="flex flex-col items-center">
                        <div className="relative">
                          {s.profile_url ? (
                            <img src={s.profile_url} alt="" className={`w-8 h-8 rounded-full object-cover mb-1 ${i < 3 ? `ring-2 ${rankColors[i]}` : ''}`} />
                          ) : (
                            <div className={`w-8 h-8 rounded-full bg-[#92400e]/20 flex items-center justify-center text-[10px] font-bold text-[#92400e] mb-1 ${i < 3 ? `ring-2 ${rankColors[i]}` : ''}`}>
                              {s.name?.charAt(0) || '?'}
                            </div>
                          )}
                          {i < 3 && <span className="absolute -top-1 -right-1 text-[10px]">{medals[i]}</span>}
                        </div>
                        <span className="text-[9px] font-medium text-[#92400e] truncate max-w-[60px]">{s.name?.split(' ')[0]}</span>
                        <span className="text-[9px] font-semibold text-[#92400e] flex items-center gap-0.5">
                          <Flame size={9} /> {s.current_streak || 0}
                        </span>
                      </div>
                    )
                  })}
                  {(!engagement.topStreakers || engagement.topStreakers.length === 0) && (
                    <p className="text-[10px] text-[#92400e]/60">No streaks yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Weekly Activity Chart */}
            {engagement.dailyBreakdown?.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-on-surface-variant mb-3">Weekly Activity</h3>
                <div className="flex items-end gap-2 h-20">
                  {engagement.dailyBreakdown.map((d, i) => {
                    const maxCount = Math.max(...engagement.dailyBreakdown.map(x => x.count), 1)
                    const height = Math.max((d.count / maxCount) * 100, 8)
                    const day = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] font-semibold text-primary">{d.count}</span>
                        <div
                          className="w-full bg-gradient-to-t from-primary to-primary-container rounded-t-md transition-all duration-500"
                          style={{ height: `${height}%`, minHeight: '4px' }}
                        />
                        <span className="text-[9px] text-on-surface-variant">{day}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Platform Health */}
        <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
          <h2 className="text-sm font-semibold text-on-surface mb-4">Platform Health</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Pass Rate</span>
              <span className="text-sm font-semibold text-on-surface">{stats?.passRate || 0}%</span>
            </div>
            <div className="w-full h-2 bg-surface-high rounded-full overflow-hidden">
              <div className="h-full bg-[#166534] rounded-full transition-all duration-700" style={{ width: `${stats?.passRate || 0}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Average Score</span>
              <span className="text-sm font-semibold text-on-surface">{stats?.avgScore || 0}%</span>
            </div>
            <div className="w-full h-2 bg-surface-high rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${stats?.avgScore || 0}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Open Tickets</span>
              <span className="text-sm font-semibold text-error">{stats?.openTickets || 0}</span>
            </div>
          </div>
        </div>

        {/* Recent Users */}
        <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-on-surface">Recent Users</h2>
            <Link to="/users" className="text-xs text-primary font-medium no-underline hover:underline">View All →</Link>
          </div>
          <div className="flex flex-col gap-3">
            {recentUsers.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-surface-low rounded-lg">
                {u.profile_url ? (
                  <img src={u.profile_url} alt={u.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg btn-gradient flex items-center justify-center text-xs font-bold text-on-primary shrink-0">
                    {u.name?.charAt(0) || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-on-surface truncate">{u.name}</p>
                  <p className="text-[10px] text-on-surface-variant truncate">{u.email}</p>
                </div>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  u.role === 'admin' ? 'bg-error-container text-error' :
                  u.role === 'manager' ? 'bg-[#fef3c7] text-[#92400e]' :
                  'bg-primary-fixed text-primary'
                }`}>{u.role}</span>
              </div>
            ))}
            {recentUsers.length === 0 && (
              <p className="text-xs text-on-surface-variant text-center py-4">No users registered yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Role Distribution */}
      <div className="mb-8 bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
        <h2 className="text-sm font-semibold text-on-surface mb-4">Role Distribution</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-primary-fixed rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-primary">{stats?.totalAdmins || 0}</p>
            <p className="text-[10px] text-primary/70 font-medium">Admins</p>
          </div>
          <div className="bg-[#fef3c7] rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-[#92400e]">{stats?.totalManagers || 0}</p>
            <p className="text-[10px] text-[#92400e]/70 font-medium">Managers</p>
          </div>
          <div className="bg-[#dcfce7] rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-[#166534]">{stats?.totalStudents || 0}</p>
            <p className="text-[10px] text-[#166534]/70 font-medium">Students</p>
          </div>
          <div className="bg-surface-high rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-on-surface">{stats?.activeAssessments || 0}</p>
            <p className="text-[10px] text-on-surface-variant font-medium">Active Tests</p>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <Leaderboard />
      </div>

      {/* Recent Support Tickets */}
      <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-on-surface">Recent Support Tickets</h2>
          <Link to="/admin/support" className="text-xs text-primary font-medium no-underline hover:underline">View All →</Link>
        </div>
        {recentTickets.length === 0 ? (
          <p className="text-xs text-on-surface-variant text-center py-4">No support tickets yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recentTickets.map(t => (
              <div key={t.id} className="flex items-start gap-3 p-3 bg-surface-low rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-on-surface truncate">{t.name}</p>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      t.user_role === 'manager' ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-primary-fixed text-primary'
                    }`}>{t.user_role || 'student'}</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant truncate">{t.message}</p>
                </div>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${ticketStatusColors[t.status] || ticketStatusColors.open}`}>
                  {t.status?.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
