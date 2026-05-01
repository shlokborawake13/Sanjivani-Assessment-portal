import { useState, useEffect } from 'react'
import { Search, CheckCircle2, XCircle, Clock } from 'lucide-react'
import api from '../services/api'

export default function ManagerResults() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/manager/results').then(res => setResults(res.data.results || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const filtered = results.filter(r =>
    !search || r.assessment_title?.toLowerCase().includes(search.toLowerCase()) || r.profiles?.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Performance Data</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">All Student Results</h1>
      </div>

      <div className="bg-surface-lowest rounded-xl p-4 mb-6" style={{ boxShadow: 'var(--shadow-ambient-sm)' }}>
        <div className="flex items-center gap-2 bg-surface-low rounded-lg px-3 py-2">
          <Search size={14} className="text-on-surface-variant" />
          <input type="text" placeholder="Search by student or assessment..." className="bg-transparent outline-none text-sm text-on-surface placeholder:text-outline w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-3 stagger-children">
        {filtered.map(r => (
          <div key={r.id} className="bg-surface-lowest rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.status === 'passed' ? 'bg-[#dcfce7]' : 'bg-error-container'}`}>
              {r.status === 'passed' ? <CheckCircle2 size={18} className="text-[#166534]" /> : <XCircle size={18} className="text-error" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-on-surface mb-0.5">{r.assessment_title}</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-primary font-medium">{r.profiles?.name || 'Unknown'}</span>
                <span className="text-[10px] bg-surface-high px-2 py-0.5 rounded-full text-on-surface-variant">{r.category}</span>
                <span className="flex items-center gap-1 text-xs text-on-surface-variant"><Clock size={11} />{r.duration}</span>
                <span className="text-xs text-on-surface-variant">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-on-surface-variant">Score</p>
                <p className="text-sm font-semibold text-on-surface">{r.score}/{r.total}</p>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-center min-w-[60px] ${r.percentage >= 80 ? 'bg-[#dcfce7]' : r.percentage >= 60 ? 'bg-primary-fixed' : 'bg-error-container'}`}>
                <p className={`text-lg font-bold ${r.percentage >= 80 ? 'text-[#166534]' : r.percentage >= 60 ? 'text-primary' : 'text-error'}`}>{r.percentage}%</p>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12"><p className="text-sm text-on-surface-variant">No results found.</p></div>}
      </div>
    </div>
  )
}
