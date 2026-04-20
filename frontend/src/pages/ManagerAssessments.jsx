import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import api from '../services/api'

export default function ManagerAssessments() {
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', category: '', duration: '60 min', questions: 0, difficulty: 'Intermediate', status: 'available' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/assessments').then(res => setAssessments(res.data.assessments || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const openNew = () => { setEditing(null); setForm({ title: '', description: '', category: '', duration: '60 min', questions: 0, difficulty: 'Intermediate', status: 'available' }); setShowModal(true) }
  const openEdit = (a) => { setEditing(a); setForm({ title: a.title, description: a.description || '', category: a.category, duration: a.duration, questions: a.questions, difficulty: a.difficulty, status: a.status }); setShowModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        const { data } = await api.put(`/assessments/${editing.id}`, form)
        setAssessments(assessments.map(a => a.id === editing.id ? data.assessment : a))
      } else {
        const { data } = await api.post('/assessments', form)
        setAssessments([data.assessment, ...assessments])
      }
      setShowModal(false)
    } catch (err) { alert(err.response?.data?.error || 'Save failed') }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this assessment?')) return
    try {
      await api.delete(`/assessments/${id}`)
      setAssessments(assessments.filter(a => a.id !== id))
    } catch (err) { alert(err.response?.data?.error || 'Delete failed') }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Content Management</p>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Assessments</h1>
          <p className="text-sm text-on-surface-variant mt-1">Create and manage assessments for students.</p>
        </div>
        <button onClick={openNew} className="btn-gradient px-5 py-2.5 rounded-[10px] text-sm font-medium flex items-center gap-2">
          <Plus size={16} /> New Assessment
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
        {assessments.map(a => (
          <div key={a.id} className="bg-surface-lowest rounded-xl p-6 group" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-start justify-between mb-3">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${a.status === 'available' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-surface-high text-on-surface-variant'}`}>
                {a.status === 'available' ? 'Active' : 'Coming Soon'}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(a)} className="p-1.5 text-on-surface-variant hover:text-primary"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(a.id)} className="p-1.5 text-on-surface-variant hover:text-error"><Trash2 size={14} /></button>
              </div>
            </div>
            <h3 className="text-base font-semibold text-on-surface mb-1">{a.title}</h3>
            <p className="text-xs text-on-surface-variant mb-3 line-clamp-2">{a.description}</p>
            <div className="flex items-center gap-3 text-[10px] text-on-surface-variant flex-wrap">
              <span className="bg-surface-high px-2 py-0.5 rounded-full">{a.category}</span>
              <span>{a.duration}</span>
              <span>{a.questions} Q</span>
              <span>{a.difficulty}</span>
            </div>
          </div>
        ))}
        {assessments.length === 0 && <p className="text-sm text-on-surface-variant col-span-full text-center py-12">No assessments yet. Create one!</p>}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-surface-lowest rounded-2xl p-8 w-full max-w-[520px] animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-on-surface">{editing ? 'Edit Assessment' : 'New Assessment'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Title</label>
                <input type="text" className="input-minimal" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Description</label>
                <textarea className="input-minimal resize-none" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Category</label>
                  <input type="text" className="input-minimal" placeholder="Aptitude" value={form.category} onChange={e => setForm({...form, category: e.target.value})} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Duration</label>
                  <input type="text" className="input-minimal" placeholder="60 min" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Questions</label>
                  <input type="number" className="input-minimal" value={form.questions} onChange={e => setForm({...form, questions: parseInt(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Difficulty</label>
                  <select className="input-minimal" value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value})}>
                    <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Status</label>
                  <select className="input-minimal" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="available">Available</option><option value="coming_soon">Coming Soon</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn-gradient py-3 rounded-[10px] text-sm font-semibold disabled:opacity-60 mt-2">
                {saving ? 'Saving...' : editing ? 'Update Assessment' : 'Create Assessment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
