import { useState, useEffect } from 'react'
import { Search, Mail, Phone, Hash, Building2, Calendar, Clock, CheckCircle2, Users } from 'lucide-react'
import api from '../services/api'

export default function ManagerStudents() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')

  useEffect(() => {
    api.get('/manager/students')
      .then(res => setStudents(res.data.students || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const departments = [...new Set(students.map(s => s.department).filter(Boolean))].sort()
  const years = [...new Set(students.map(s => s.year).filter(Boolean))].sort()

  const filtered = students.filter(s => {
    if (deptFilter !== 'all' && s.department !== deptFilter) return false
    if (yearFilter !== 'all' && s.year !== yearFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.prn?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Student Directory</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">All Students</h1>
        <p className="text-sm text-on-surface-variant mt-1">{students.length} registered students</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-primary-fixed rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-primary">{students.length}</p>
          <p className="text-[11px] font-medium text-primary/70 mt-0.5">Total</p>
        </div>
        <div className="bg-[#dcfce7] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#166534]">{students.filter(s => s.confirmed).length}</p>
          <p className="text-[11px] font-medium text-[#166534]/70 mt-0.5">Verified</p>
        </div>
        <div className="bg-surface-high rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-on-surface">{departments.length}</p>
          <p className="text-[11px] font-medium text-on-surface-variant mt-0.5">Departments</p>
        </div>
        <div className="bg-[#fef3c7] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#92400e]">
            {students.filter(s => {
              if (!s.last_sign_in) return false
              const diff = Date.now() - new Date(s.last_sign_in).getTime()
              return diff < 7 * 24 * 60 * 60 * 1000
            }).length}
          </p>
          <p className="text-[11px] font-medium text-[#92400e]/70 mt-0.5">Active (7d)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-lowest rounded-xl p-4 mb-6 flex flex-col gap-3" style={{ boxShadow: 'var(--shadow-ambient-sm)' }}>
        <div className="flex items-center gap-2 bg-surface-low rounded-lg px-3 py-2">
          <Search size={14} className="text-on-surface-variant shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, PRN or department..."
            className="bg-transparent outline-none text-sm text-on-surface placeholder:text-outline w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Dept:</span>
          {['all', ...departments].map(d => (
            <button key={d} onClick={() => setDeptFilter(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${deptFilter === d ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-high'}`}>
              {d === 'all' ? 'All' : d}
            </button>
          ))}
          {years.length > 0 && (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant ml-2">Year:</span>
              {['all', ...years].map(y => (
                <button key={y} onClick={() => setYearFilter(y)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${yearFilter === y ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-high'}`}>
                  {y === 'all' ? 'All' : `Year ${y}`}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Student Cards */}
      <div className="flex flex-col gap-3 stagger-children">
        {filtered.map(s => (
          <div key={s.id} className="bg-surface-lowest rounded-xl p-5" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">

              {/* Avatar */}
              <div className="relative shrink-0">
                {s.profile_url ? (
                  <img src={s.profile_url} alt={s.name} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl btn-gradient flex items-center justify-center text-base font-bold text-on-primary">
                    {s.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-sm font-semibold text-on-surface">{s.name}</h3>
                  {s.confirmed && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-[#166534] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={10} /> Verified
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-2">
                  <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <Mail size={11} className="shrink-0 text-outline" />{s.email}
                  </p>
                  {s.phone && (
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Phone size={11} className="shrink-0 text-outline" />{s.phone}
                    </p>
                  )}
                  {s.prn && (
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Hash size={11} className="shrink-0 text-outline" />PRN: {s.prn}
                    </p>
                  )}
                  {s.department && (
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Building2 size={11} className="shrink-0 text-outline" />
                      {s.department}
                      {s.year ? ` · Year ${s.year}` : ''}
                      {s.division ? ` · Div ${s.division}` : ''}
                    </p>
                  )}
                  {s.created_at && (
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Calendar size={11} className="shrink-0 text-outline" />
                      Joined {new Date(s.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  {s.last_sign_in && (
                    <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Clock size={11} className="shrink-0 text-outline" />
                      Last seen {new Date(s.last_sign_in).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Users size={32} className="text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">
              {students.length === 0 ? 'No students have registered yet.' : 'No students match your filters.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
