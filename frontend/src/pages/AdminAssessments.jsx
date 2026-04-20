import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Upload, FileText, Eye, AlertTriangle, CheckCircle2, ChevronDown, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import api from '../services/api'

export default function AdminAssessments() {
  const role = useAuthStore((s) => s.role)
  const navigate = useNavigate()
  const isAdmin = role === 'admin' || role === 'manager'
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', category: 'Aptitude', duration: '60 min', questions: 0, difficulty: 'Intermediate', status: 'available', expires_at: '', level: 'Beginner, Intermediate, Advanced', type: 'Practice' })
  const [saving, setSaving] = useState(false)

  // CSV upload state
  const [showUpload, setShowUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef(null)

  // Attempts/Violations view
  const [showAttempts, setShowAttempts] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [attemptsLoading, setAttemptsLoading] = useState(false)
  const [attemptFilter, setAttemptFilter] = useState('all') // all, clean, cheating
  const [selectedAttempt, setSelectedAttempt] = useState(null)

  useEffect(() => {
    api.get('/assessments').then(res => setAssessments(res.data.assessments || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ title: '', description: '', category: 'Aptitude', duration: '60 min', questions: 0, difficulty: 'Intermediate', status: 'available', expires_at: '', level: 'Beginner, Intermediate, Advanced', type: 'Practice' })
    setShowModal(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({ title: a.title, description: a.description || '', category: a.category, duration: a.duration, questions: a.questions, difficulty: a.difficulty, status: a.status, expires_at: a.expires_at || '', level: a.level || '', type: a.type || 'Practice' })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        const { data } = await api.put(`/assessments/${editing.id}`, form)
        setAssessments(assessments.map(a => a.id === editing.id ? { ...data.assessment, question_count: a.question_count } : a))
      } else {
        const { data } = await api.post('/assessments', form)
        setAssessments([{ ...data.assessment, question_count: 0 }, ...assessments])
      }
      setShowModal(false)
    } catch (err) { alert(err.response?.data?.error || 'Save failed') }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this assessment and all its questions?')) return
    try {
      await api.delete(`/assessments/${id}`)
      setAssessments(assessments.filter(a => a.id !== id))
    } catch (err) { alert(err.response?.data?.error || 'Delete failed') }
  }

  // CSV Upload
  const handleCSVUpload = async (assessmentId) => {
    const file = fileRef.current?.files?.[0]
    if (!file) return alert('Please select a CSV file')
    if (!file.name.endsWith('.csv')) return alert('Only CSV files are allowed')

    setUploading(true)
    setUploadResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const sessionStr = localStorage.getItem('sanjivani_session')
      const session = sessionStr ? JSON.parse(sessionStr) : null

      const res = await fetch(`/api/assessments/${assessmentId}/upload-csv`, {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setUploadResult({ success: true, message: data.message, count: data.count })
      // Update question count
      setAssessments(prev => prev.map(a => a.id === assessmentId ? { ...a, question_count: (a.question_count || 0) + data.count, questions: (a.questions || 0) + data.count } : a))
    } catch (err) {
      setUploadResult({ success: false, message: err.message })
    }
    setUploading(false)
  }

  const clearQuestions = async (assessmentId) => {
    if (!confirm('Delete ALL questions for this assessment?')) return
    try {
      await api.delete(`/assessments/${assessmentId}/questions`)
      setAssessments(prev => prev.map(a => a.id === assessmentId ? { ...a, question_count: 0, questions: 0 } : a))
      setUploadResult({ success: true, message: 'All questions deleted' })
    } catch (err) { alert(err.response?.data?.error || 'Failed to delete questions') }
  }

  // View attempts
  const viewAttempts = async (assessmentId) => {
    setShowAttempts(assessmentId)
    setAttemptsLoading(true)
    try {
      const { data } = await api.get('/attempts')
      const filtered = (data.attempts || []).filter(a => a.assessment_id === assessmentId)
      setAttempts(filtered)
    } catch (err) { console.error(err) }
    setAttemptsLoading(false)
  }

  const filteredAttempts = attempts.filter(a => {
    if (attemptFilter === 'cheating') return a.violation_count > 0
    if (attemptFilter === 'clean') return a.violation_count === 0
    return true
  })

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">{isAdmin ? 'Content Management' : 'Available Tests'}</p>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Assessments</h1>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="btn-gradient px-5 py-2.5 rounded-[10px] text-sm font-medium flex items-center gap-2">
            <Plus size={16} /> New Assessment
          </button>
        )}
      </div>

      {/* Assessment Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
        {assessments.map(a => (
          <div key={a.id} className="bg-surface-lowest rounded-xl p-6 group" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-start justify-between mb-3">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${a.status === 'available' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-surface-high text-on-surface-variant'}`}>
                {a.status === 'available' ? 'Active' : 'Coming Soon'}
              </span>
              {isAdmin && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(a)} className="p-1.5 text-on-surface-variant hover:text-primary"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 text-on-surface-variant hover:text-error"><Trash2 size={14} /></button>
                </div>
              )}
            </div>

            <h3 className="text-base font-semibold text-on-surface mb-1">{a.title}</h3>
            <p className="text-xs text-on-surface-variant mb-3 line-clamp-2">{a.description}</p>

            <div className="flex items-center gap-3 text-[10px] text-on-surface-variant flex-wrap mb-4">
              <span className="bg-surface-high px-2 py-0.5 rounded-full">{a.category}</span>
              <span>{a.duration}</span>
              <span className="font-semibold text-primary">{a.question_count || a.questions || 0} Qs</span>
              <span>{a.difficulty}</span>
            </div>

            {/* Action Buttons */}
            {isAdmin ? (
              <div className="flex gap-2">
                <button onClick={() => { setShowUpload(a.id); setUploadResult(null) }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Upload size={12} /> Upload CSV
                </button>
                <button onClick={() => viewAttempts(a.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium bg-surface-high text-on-surface-variant hover:bg-surface-highest transition-colors">
                  <Eye size={12} /> Attempts
                </button>
              </div>
            ) : (
              <button
                onClick={() => a.status === 'available' && navigate(`/assessment/${a.id}/take`)}
                disabled={a.status !== 'available'}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  a.status === 'available'
                    ? 'btn-gradient cursor-pointer'
                    : 'bg-surface-high text-on-surface-variant cursor-not-allowed'
                }`}
              >
                {a.status === 'available' ? (<>Start Assessment <ArrowRight size={14} /></>) : 'Coming Soon'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── CSV Upload Modal ─────────────────────── */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(null)}>
          <div className="bg-surface-lowest rounded-2xl p-8 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-on-surface">Upload Questions (CSV)</h2>
              <button onClick={() => setShowUpload(null)} className="p-1.5 text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
            </div>

            <div className="bg-surface-low rounded-xl p-4 mb-4 text-xs text-on-surface-variant">
              <p className="font-semibold text-on-surface mb-2">CSV Format:</p>
              <code className="block bg-surface-high rounded p-2 text-[10px] font-mono overflow-x-auto">
                question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
              </code>
              <p className="mt-2">• correct_answer should be A, B, C, or D</p>
              <p>• explanation is optional</p>
            </div>

            <input ref={fileRef} type="file" accept=".csv" className="input-minimal text-sm mb-4" />

            {uploadResult && (
              <div className={`flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm ${
                uploadResult.success ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fef2f2] text-error'
              }`}>
                {uploadResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {uploadResult.message}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => clearQuestions(showUpload)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-error/10 text-error hover:bg-error/20 transition-colors">
                Clear All Qs
              </button>
              <button onClick={() => handleCSVUpload(showUpload)} disabled={uploading}
                className="flex-1 btn-gradient py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {uploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload size={14} /> Upload</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Attempts/Violations Modal ─────────────────────── */}
      {showAttempts && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setShowAttempts(null); setSelectedAttempt(null) }}>
          <div className="bg-surface-lowest rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-on-surface">Student Attempts</h2>
              <button onClick={() => { setShowAttempts(null); setSelectedAttempt(null) }} className="p-1.5 text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mb-5">
              {['all', 'clean', 'cheating'].map(f => (
                <button key={f} onClick={() => setAttemptFilter(f)}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition-colors ${
                    attemptFilter === f
                      ? f === 'cheating' ? 'bg-error/15 text-error' : 'bg-primary/15 text-primary'
                      : 'bg-surface-high text-on-surface-variant hover:bg-surface-highest'
                  }`}>
                  {f === 'all' ? 'All' : f === 'clean' ? '✓ Clean' : '⚠ Cheating Detected'}
                </button>
              ))}
              <span className="text-xs text-on-surface-variant ml-auto">{filteredAttempts.length} attempts</span>
            </div>

            {attemptsLoading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
            ) : filteredAttempts.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-8">No attempts found.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredAttempts.map(att => (
                  <div key={att.id}>
                    <button onClick={() => setSelectedAttempt(selectedAttempt === att.id ? null : att.id)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-low hover:bg-surface-high transition-colors text-left">
                      {/* Student info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{att.profiles?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-on-surface-variant">{att.profiles?.email} • {att.profiles?.prn}</p>
                      </div>
                      {/* Score */}
                      <div className="text-center shrink-0">
                        <p className="text-lg font-bold text-on-surface">{att.percentage != null ? `${att.percentage}%` : '—'}</p>
                        <p className="text-[9px] text-on-surface-variant uppercase">{att.score ?? 0}/{att.total ?? 0}</p>
                      </div>
                      {/* Status */}
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                        att.status === 'submitted' ? 'bg-[#dcfce7] text-[#166534]' :
                        att.status === 'auto_submitted' ? 'bg-[#fef2f2] text-error' :
                        'bg-[#fef3c7] text-[#92400e]'
                      }`}>
                        {att.status === 'auto_submitted' ? 'Auto-submitted' : att.status}
                      </span>
                      {/* Violations */}
                      {att.violation_count > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-error bg-error/10 px-2 py-1 rounded-full shrink-0">
                          <AlertTriangle size={10} /> {att.violation_count}
                        </span>
                      )}
                      <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${selectedAttempt === att.id ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Expanded: Violation Timeline */}
                    {selectedAttempt === att.id && (
                      <div className="ml-4 mt-2 bg-surface-lowest rounded-xl p-4 border border-outline/10 animate-fade-in">
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-surface-low rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase">Submission Reason</p>
                            <p className="text-xs font-medium text-on-surface mt-0.5">{att.submission_reason || 'N/A'}</p>
                          </div>
                          <div className="bg-surface-low rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase">Time</p>
                            <p className="text-xs font-medium text-on-surface mt-0.5">
                              {att.started_at ? new Date(att.started_at).toLocaleString() : '—'}
                            </p>
                          </div>
                        </div>

                        {att.warnings_log && att.warnings_log.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Violation Timeline</p>
                            <div className="flex flex-col gap-1.5">
                              {att.warnings_log.map((w, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs bg-surface-low rounded-lg px-3 py-2">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    w.type === 'tab_switch' ? 'bg-error' :
                                    w.type === 'fullscreen_exit' ? 'bg-[#f59e0b]' :
                                    w.type === 'paste_attempt' ? 'bg-[#ef4444]' :
                                    'bg-on-surface-variant'
                                  }`} />
                                  <span className="font-mono text-[10px] text-on-surface-variant shrink-0">
                                    {w.timestamp ? new Date(w.timestamp).toLocaleTimeString() : '—'}
                                  </span>
                                  <span className="text-on-surface">{w.type?.replace(/_/g, ' ')}</span>
                                  <span className="text-on-surface-variant ml-auto truncate">{w.details}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-on-surface-variant">No violations recorded — clean attempt.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create/Edit Assessment Modal ─────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-surface-lowest rounded-2xl p-8 w-full max-w-[560px] max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
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
                  <select className="input-minimal" value={form.category} onChange={e => setForm({...form, category: e.target.value})} required>
                    <option>Aptitude</option>
                    <option>Coding</option>
                    <option>Communication</option>
                    <option>Technical</option>
                    <option>Reasoning</option>
                    <option>General Knowledge</option>
                    <option>Quantitative</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Duration</label>
                  <input type="text" className="input-minimal" placeholder="60 min" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Difficulty</label>
                  <select className="input-minimal" value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value})}>
                    <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Type</label>
                  <select className="input-minimal" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option>Practice</option><option>Assessment</option><option>Interview</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Status</label>
                  <select className="input-minimal" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="available">Available</option><option value="coming_soon">Coming Soon</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Expires At (optional)</label>
                <input type="datetime-local" className="input-minimal" value={form.expires_at ? form.expires_at.slice(0, 16) : ''} onChange={e => setForm({...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : ''})} />
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
