import { useState, useEffect } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import api from '../services/api'

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'info' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/announcements').then(res => setAnnouncements(res.data.announcements || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.post('/announcements', form)
      setAnnouncements([data.announcement, ...announcements])
      setShowModal(false)
      setForm({ title: '', message: '', type: 'info' })
    } catch (err) { alert(err.response?.data?.error || 'Failed') }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return
    try { await api.delete(`/announcements/${id}`); setAnnouncements(announcements.filter(a => a.id !== id)) }
    catch (err) { alert('Delete failed') }
  }

  const typeColors = { important: 'bg-error-container text-error', info: 'bg-primary-fixed text-primary', update: 'bg-[#dcfce7] text-[#166534]' }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Communications</p>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Announcements</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-gradient px-5 py-2.5 rounded-[10px] text-sm font-medium flex items-center gap-2">
          <Plus size={16} /> New Announcement
        </button>
      </div>

      <div className="flex flex-col gap-3 stagger-children">
        {announcements.map(a => (
          <div key={a.id} className="bg-surface-lowest rounded-xl p-5 flex items-start gap-4 group" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${typeColors[a.type] || typeColors.info}`}>{a.type}</span>
                <span className="text-[10px] text-on-surface-variant">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              <h3 className="text-sm font-semibold text-on-surface mb-1">{a.title}</h3>
              <p className="text-xs text-on-surface-variant">{a.message}</p>
            </div>
            <button onClick={() => handleDelete(a.id)} className="p-2 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {announcements.length === 0 && <div className="text-center py-12"><p className="text-sm text-on-surface-variant">No announcements yet.</p></div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-surface-lowest rounded-2xl p-8 w-full max-w-[480px] animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-on-surface">New Announcement</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-on-surface-variant"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Title</label>
                <input type="text" className="input-minimal" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Message</label>
                <textarea className="input-minimal resize-none" rows={4} value={form.message} onChange={e => setForm({...form, message: e.target.value})} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Type</label>
                <select className="input-minimal" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="info">Info</option><option value="important">Important</option><option value="update">Update</option>
                </select>
              </div>
              <button type="submit" disabled={saving} className="btn-gradient py-3 rounded-[10px] text-sm font-semibold disabled:opacity-60">
                {saving ? 'Publishing...' : 'Publish Announcement'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
