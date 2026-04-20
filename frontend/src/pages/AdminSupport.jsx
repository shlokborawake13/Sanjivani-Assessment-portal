import { useState, useEffect } from 'react'
import { Search, Mail, Phone, Hash, Building2, Calendar, User } from 'lucide-react'
import api from '../services/api'

export default function AdminSupport() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.get('/support').then(res => setTickets(res.data.tickets || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id, status) => {
    try {
      const { data } = await api.put(`/support/${id}`, { status })
      setTickets(tickets.map(t => t.id === id ? { ...t, ...data.ticket } : t))
    } catch (err) { alert('Update failed') }
  }

  const statusColors = {
    open: 'bg-error-container text-error',
    in_progress: 'bg-[#fef3c7] text-[#92400e]',
    resolved: 'bg-[#dcfce7] text-[#166534]',
    closed: 'bg-surface-high text-on-surface-variant'
  }

  const filtered = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.prn?.toLowerCase().includes(q) ||
        t.department?.toLowerCase().includes(q) ||
        t.message?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const statusCounts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Support Center</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Support Tickets</h1>
        <p className="text-sm text-on-surface-variant mt-1">{tickets.length} total tickets · {statusCounts.open} open</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: statusCounts.all, color: 'bg-surface-high text-on-surface' },
          { label: 'Open', value: statusCounts.open, color: 'bg-error-container text-error' },
          { label: 'In Progress', value: statusCounts.in_progress, color: 'bg-[#fef3c7] text-[#92400e]' },
          { label: 'Resolved', value: statusCounts.resolved, color: 'bg-[#dcfce7] text-[#166534]' },
          { label: 'Closed', value: statusCounts.closed, color: 'bg-surface-high text-on-surface-variant' },
        ].map(c => (
          <div key={c.label} className={`${c.color} rounded-xl p-3 text-center`}>
            <p className="text-xl font-bold">{c.value}</p>
            <p className="text-[10px] font-medium opacity-70 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-lowest rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4" style={{ boxShadow: 'var(--shadow-ambient-sm)' }}>
        <div className="flex items-center gap-2 bg-surface-low rounded-lg px-3 py-2 flex-1 w-full sm:w-auto">
          <Search size={14} className="text-on-surface-variant" />
          <input type="text" placeholder="Search by name, email, PRN, department..." className="bg-transparent outline-none text-sm text-on-surface placeholder:text-outline w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === s ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-high'}`}>
              {s.replace('_', ' ')} ({statusCounts[s]})
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 stagger-children">
        {filtered.map(t => (
          <div key={t.id} className="bg-surface-lowest rounded-xl p-5" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Status & Date */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${statusColors[t.status]}`}>{t.status.replace('_', ' ')}</span>
                  <span className="text-[10px] text-on-surface-variant">{new Date(t.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="text-[10px] text-on-surface-variant/50">{new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Student Info Card */}
                <div className="bg-surface-low rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    {t.profile_url ? (
                      <img src={t.profile_url} alt={t.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg btn-gradient flex items-center justify-center text-sm font-bold text-on-primary shrink-0">
                        {t.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-on-surface">{t.name}</p>
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          t.user_role === 'admin' ? 'bg-error-container text-error' :
                          t.user_role === 'manager' ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-primary-fixed text-primary'
                        }`}>{t.user_role || 'student'}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                          <Mail size={10} className="shrink-0 text-outline" />{t.email}
                        </p>
                        {t.prn && (
                          <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                            <Hash size={10} className="shrink-0 text-outline" />PRN: {t.prn}
                          </p>
                        )}
                        {t.department && (
                          <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                            <Building2 size={10} className="shrink-0 text-outline" />
                            {t.department}
                            {t.year ? ` · ${t.year} Year` : ''}
                            {t.division ? ` · Div ${t.division}` : ''}
                          </p>
                        )}
                        {t.phone && (
                          <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                            <Phone size={10} className="shrink-0 text-outline" />{t.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Message */}
                <div className="bg-surface-low/50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap">{t.message}</p>
                </div>
              </div>

              {/* Status Changer */}
              <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                className="appearance-none bg-surface-low rounded-lg px-3 py-2 text-xs font-medium text-on-surface-variant outline-none cursor-pointer shrink-0">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12"><p className="text-sm text-on-surface-variant">No tickets found.</p></div>}
      </div>
    </div>
  )
}
