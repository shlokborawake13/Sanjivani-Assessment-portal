import { useState, useEffect } from 'react'
import { Search, ChevronDown, Trash2, ShieldCheck, GraduationCap, Briefcase, Mail, Phone, Hash, Building2, Calendar, Clock } from 'lucide-react'
import api from '../services/api'
import useAuthStore from '../store/authStore'

export default function AdminUsers() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    api.get('/admin/users')
      .then(res => {
        const fetchedUsers = res.data.users || []
        console.log(`[AdminUsers] Fetched ${fetchedUsers.length} users from /admin/users`)
        setUsers(fetchedUsers)
      })
      .catch(err => {
        console.error('[AdminUsers] Failed to fetch users:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const changeRole = async (userId, newRole) => {
    setUpdating(userId + '_role')
    try {
      const { data } = await api.put(`/admin/users/${userId}/role`, { role: newRole })
      setUsers(users.map(u => u.id === userId ? { ...u, ...data.user } : u))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to change role')
    }
    setUpdating(null)
  }

  const toggleStatus = async (userId, currentActive) => {
    if (userId === currentUser?.id) return
    setUpdating(userId + '_status')
    try {
      await api.put(`/admin/users/${userId}/status`, { is_active: !currentActive })
      setUsers(users.map(u => u.id === userId ? { ...u, is_active: !currentActive } : u))
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to update status'
      alert(msg.includes('unavailable') ? 'Backend is temporarily unavailable. Please restart the backend server and try again.' : msg)
    }
    setUpdating(null)
  }

  const deleteUser = async (userId, userName) => {
    if (!confirm(`Delete "${userName}"? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/users/${userId}`)
      setUsers(users.filter(u => u.id !== userId))
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user')
    }
  }

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (statusFilter === 'active' && !u.is_active) return false
    if (statusFilter === 'inactive' && u.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.prn?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const roleIcon = { admin: ShieldCheck, manager: Briefcase, student: GraduationCap }
  const roleColors = {
    admin: { badge: 'bg-error-container text-error', icon: 'text-error' },
    manager: { badge: 'bg-[#fef3c7] text-[#92400e]', icon: 'text-[#92400e]' },
    student: { badge: 'bg-primary-fixed text-primary', icon: 'text-primary' },
  }

  const counts = {
    all: users.length,
    student: users.filter(u => u.role === 'student').length,
    manager: users.filter(u => u.role === 'manager').length,
    admin: users.filter(u => u.role === 'admin').length,
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">User Management</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">All Users</h1>
        <p className="text-sm text-on-surface-variant mt-1">{users.length} registered accounts</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: users.length, color: 'bg-surface-high text-on-surface' },
          { label: 'Students', value: counts.student, color: 'bg-primary-fixed text-primary' },
          { label: 'Managers', value: counts.manager, color: 'bg-[#fef3c7] text-[#92400e]' },
          { label: 'Admins', value: counts.admin, color: 'bg-error-container text-error' },
        ].map(c => (
          <div key={c.label} className={`${c.color} rounded-xl p-4 text-center`}>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-[11px] font-medium opacity-70 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-surface-lowest rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3" style={{ boxShadow: 'var(--shadow-ambient-sm)' }}>
        <div className="flex items-center gap-2 bg-surface-low rounded-lg px-3 py-2 flex-1 w-full sm:w-auto">
          <Search size={14} className="text-on-surface-variant shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, PRN or department..."
            className="bg-transparent outline-none text-sm text-on-surface placeholder:text-outline w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['all', 'student', 'manager', 'admin'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${roleFilter === r ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-high'}`}>
              {r} ({counts[r] ?? users.length})
            </button>
          ))}
          <div className="w-px h-4 bg-outline/20 mx-1" />
          {['all', 'active', 'inactive'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-surface-high text-on-surface font-semibold' : 'text-on-surface-variant hover:bg-surface-high'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* User List */}
      <div className="flex flex-col gap-3 stagger-children">
        {filtered.map(user => {
          const RoleIcon = roleIcon[user.role] || GraduationCap
          const rc = roleColors[user.role] || roleColors.student
          const isUpdatingRole = updating === user.id + '_role'
          const isUpdatingStatus = updating === user.id + '_status'
          const isSelf = user.id === currentUser?.id

          return (
            <div key={user.id} className="bg-surface-lowest rounded-xl p-5" style={{ boxShadow: 'var(--shadow-ambient)' }}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">

                {/* Avatar + Status dot */}
                <div className="relative shrink-0">
                  {user.profile_url ? (
                    <img src={user.profile_url} alt={user.name} className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl btn-gradient flex items-center justify-center text-base font-bold text-on-primary">
                      {user.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-surface-lowest ${user.is_active ? 'bg-[#22c55e]' : 'bg-outline'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-semibold text-on-surface">{user.name}</h3>
                    <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${rc.badge}`}>
                      <RoleIcon size={10} />
                      {user.role}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${user.is_active ? 'bg-[#dcfce7] text-[#166534]' : 'bg-surface-high text-on-surface-variant'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {isSelf && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent">You</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Mail size={11} className="shrink-0 text-outline" />{user.email}
                    </p>
                    {user.phone && (
                      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <Phone size={11} className="shrink-0 text-outline" />{user.phone}
                      </p>
                    )}
                    {user.prn && (
                      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <Hash size={11} className="shrink-0 text-outline" />PRN: {user.prn}
                      </p>
                    )}
                    {user.department && (
                      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <Building2 size={11} className="shrink-0 text-outline" />{user.department}
                        {user.year ? ` · Year ${user.year}` : ''}
                        {user.division ? ` · Div ${user.division}` : ''}
                      </p>
                    )}
                    {user.created_at && (
                      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <Calendar size={11} className="shrink-0 text-outline" />
                        Joined {new Date(user.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                    {user.last_sign_in && (
                      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <Clock size={11} className="shrink-0 text-outline" />
                        Last seen {new Date(user.last_sign_in).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Active / Inactive toggle */}
                  {!isSelf && (
                    <button
                      onClick={() => toggleStatus(user.id, user.is_active)}
                      disabled={isUpdatingStatus}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                        user.is_active
                          ? 'bg-surface-high text-on-surface-variant hover:bg-error-container hover:text-error'
                          : 'bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0]'
                      }`}
                    >
                      {isUpdatingStatus ? '...' : user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}

                  {/* Role change */}
                  <div className="relative">
                    <select
                      value={user.role}
                      onChange={e => changeRole(user.id, e.target.value)}
                      disabled={isUpdatingRole || isSelf}
                      className="appearance-none bg-surface-low rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium text-on-surface-variant outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="student">Student</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                  </div>

                  {/* Delete */}
                  {!isSelf && (
                    <button
                      onClick={() => deleteUser(user.id, user.name)}
                      className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors"
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-on-surface-variant">No users found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
