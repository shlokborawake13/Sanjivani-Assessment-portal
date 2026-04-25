import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Upload, FileText, Eye, AlertTriangle, CheckCircle2, ChevronDown, ArrowRight, Shield, RotateCcw, Clock, Users, Settings, Download, BarChart3, TrendingUp, Award } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import api from '../services/api'

const DEPARTMENTS = ['Computer Engineering', 'IT', 'ENTC', 'Mechanical', 'Civil', 'Electrical', 'AI & DS', 'AIML']
const YEARS = ['FE', 'SE', 'TE', 'BE']
const SECTIONS = ['A', 'B', 'C', 'D']

const defaultForm = {
  title: '', description: '', category: 'Aptitude', duration: '60 min', questions: 0,
  difficulty: 'Intermediate', status: 'available', expires_at: '', level: 'Beginner, Intermediate, Advanced', type: 'Practice',
  // New fields
  duration_minutes: 60, total_marks: 0, passing_marks: 0, max_attempts: 1,
  instructions: '', exam_type: 'non_proctored', is_active: true,
  start_time: '', end_time: '', late_entry_minutes: 0, allow_late_entry: false,
  shuffle_questions: true, shuffle_options: true, show_results_immediately: true,
  target_departments: [], target_years: [], target_sections: [], open_to_all: true
}

export default function AdminAssessments() {
  const role = useAuthStore((s) => s.role)
  const navigate = useNavigate()
  const isAdmin = role === 'admin'
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...defaultForm })
  const [saving, setSaving] = useState(false)
  const [formTab, setFormTab] = useState('basic')

  // CSV upload state
  const [showUpload, setShowUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef(null)

  // Attempts/Violations view
  const [showAttempts, setShowAttempts] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [attemptsLoading, setAttemptsLoading] = useState(false)
  const [attemptFilter, setAttemptFilter] = useState('all')
  const [selectedAttempt, setSelectedAttempt] = useState(null)
  const [assessmentStats, setAssessmentStats] = useState(null)

  // Reset attempt
  const [resetAttemptId, setResetAttemptId] = useState(null)
  const [resetReason, setResetReason] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    api.get('/assessments').then(res => setAssessments(res.data.assessments || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ ...defaultForm })
    setFormTab('basic')
    setShowModal(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({
      title: a.title || '', description: a.description || '', category: a.category || 'Aptitude',
      duration: a.duration || '60 min', questions: a.questions || 0, difficulty: a.difficulty || 'Intermediate',
      status: a.status || 'available', expires_at: a.expires_at || '', level: a.level || '',
      type: a.type || 'Practice',
      duration_minutes: a.duration_minutes || parseInt((a.duration || '60').match(/(\d+)/)?.[1]) || 60,
      total_marks: a.total_marks || 0, passing_marks: a.passing_marks || 0,
      max_attempts: a.max_attempts || 1, instructions: a.instructions || '',
      exam_type: a.exam_type || 'non_proctored', is_active: a.is_active !== false,
      start_time: a.start_time ? a.start_time.slice(0, 16) : '',
      end_time: a.end_time ? a.end_time.slice(0, 16) : '',
      late_entry_minutes: a.late_entry_minutes || 0, allow_late_entry: !!a.allow_late_entry,
      shuffle_questions: a.shuffle_questions !== false, shuffle_options: a.shuffle_options !== false,
      show_results_immediately: a.show_results_immediately !== false,
      target_departments: a.target_departments || [], target_years: a.target_years || [],
      target_sections: a.target_sections || [], open_to_all: a.open_to_all !== false
    })
    setFormTab('basic')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        duration: `${parseInt(form.duration_minutes) || 60} min`,
        start_time: form.start_time ? new Date(form.start_time).toISOString() : null,
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
      }
      if (editing) {
        const { data } = await api.put(`/assessments/${editing.id}`, payload)
        setAssessments(assessments.map(a => a.id === editing.id ? { ...data.assessment, question_count: a.question_count } : a))
      } else {
        const { data } = await api.post('/assessments', payload)
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

    // Detect if this is a coding assessment
    const targetAssessment = assessments.find(a => a.id === assessmentId)
    const isCoding = targetAssessment?.category?.toLowerCase() === 'coding'
    const uploadPath = isCoding ? 'upload-coding-csv' : 'upload-csv'

    setUploading(true)
    setUploadResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const sessionStr = localStorage.getItem('sanjivani_session')
      const session = sessionStr ? JSON.parse(sessionStr) : null

      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/assessments/${assessmentId}/${uploadPath}`, {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      const uploadCount = data.count || data.success || 0
      let message = data.message
      if (data.failed > 0) {
        message += ` (${data.failed} row(s) had errors)`
      }
      setUploadResult({
        success: true,
        message,
        count: uploadCount,
        errors: data.errors
      })
      setAssessments(prev => prev.map(a => a.id === assessmentId ? { ...a, question_count: (a.question_count || 0) + uploadCount, questions: (a.questions || 0) + uploadCount } : a))
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
    setAssessmentStats(null)
    try {
      // Fetch attempts and stats in parallel
      const [attRes, statsRes] = await Promise.allSettled([
        api.get(`/admin/attempts?assessment_id=${assessmentId}&include_invalidated=true`),
        api.get(`/admin/assessments/${assessmentId}/stats`)
      ])
      if (attRes.status === 'fulfilled') setAttempts(attRes.value.data.attempts || [])
      if (statsRes.status === 'fulfilled') setAssessmentStats(statsRes.value.data)
    } catch (err) {
      try {
        const { data } = await api.get('/attempts')
        const filtered = (data.attempts || []).filter(a => a.assessment_id === assessmentId)
        setAttempts(filtered)
      } catch (e) { console.error(e) }
    }
    setAttemptsLoading(false)
  }

  // Download CSV export
  const downloadCSV = async (assessmentId) => {
    try {
      const sessionStr = localStorage.getItem('sanjivani_session')
      const session = sessionStr ? JSON.parse(sessionStr) : null
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/admin/assessments/${assessmentId}/export-csv`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const cd = res.headers.get('content-disposition') || ''
      const match = cd.match(/filename="(.+)"/) 
      a.download = match ? match[1] : 'assessment_results.csv'
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message || 'Failed to export CSV')
    }
  }

  // Reset attempt
  const handleResetAttempt = async () => {
    if (!resetAttemptId || !resetReason.trim()) return
    setResetting(true)
    try {
      await api.post(`/admin/attempts/${resetAttemptId}/reset`, { reason: resetReason.trim() })
      // Update local state
      setAttempts(prev => prev.map(a => a.id === resetAttemptId ? { ...a, invalidated: true, invalidated_reason: resetReason.trim() } : a))
      setResetAttemptId(null)
      setResetReason('')
      alert('Attempt reset successfully. Student can now re-attempt.')
    } catch (err) {
      alert(err.response?.data?.error || 'Reset failed')
    }
    setResetting(false)
  }

  const filteredAttempts = attempts.filter(a => {
    if (attemptFilter === 'cheating') return a.violation_count > 0
    if (attemptFilter === 'clean') return a.violation_count === 0
    if (attemptFilter === 'invalidated') return a.invalidated
    return true
  })

  // Multi-select toggle helper
  const toggleMulti = (field, value) => {
    setForm(prev => {
      const arr = prev[field] || []
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
    })
  }

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
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${a.is_active !== false && a.status === 'available' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-surface-high text-on-surface-variant'}`}>
                  {a.is_active !== false && a.status === 'available' ? 'Active' : 'Inactive'}
                </span>
                {a.exam_type === 'proctored' && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <Shield size={10} /> Proctored
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(a)} className="p-1.5 text-on-surface-variant hover:text-primary"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 text-on-surface-variant hover:text-error"><Trash2 size={14} /></button>
                </div>
              )}
            </div>

            <h3 className="text-base font-semibold text-on-surface mb-1">{a.title}</h3>
            <p className="text-xs text-on-surface-variant mb-3 line-clamp-2">{a.description}</p>

            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant flex-wrap mb-3">
              <span className="bg-surface-high px-2 py-0.5 rounded-full">{a.category}</span>
              <span>{a.duration_minutes || parseInt((a.duration || '60').match(/(\d+)/)?.[1]) || 60} min</span>
              <span className="font-semibold text-primary">{a.question_count || a.questions || 0} Qs</span>
              <span>{a.difficulty}</span>
            </div>

            {/* Extra info row */}
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant flex-wrap mb-4">
              <span>Max: {a.max_attempts || 1} attempt{(a.max_attempts || 1) > 1 ? 's' : ''}</span>
              {a.total_marks > 0 && <span>• {a.total_marks} marks</span>}
              {a.passing_marks > 0 && <span>• Pass: {a.passing_marks}%</span>}
              {!a.open_to_all && <span className="text-amber-600">• Restricted</span>}
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
                onClick={() => {
                  if (a.can_attempt === false) return
                  const cat = (a.category || '').toLowerCase()
                  if (cat === 'coding') navigate(`/assessment/${a.id}/code`)
                  else if (cat === 'communication') navigate(`/assessment/${a.id}/communicate`)
                  else navigate(`/assessment/${a.id}/take`)
                }}
                disabled={a.can_attempt === false}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  a.can_attempt !== false ? 'btn-gradient cursor-pointer' : 'bg-surface-high text-on-surface-variant cursor-not-allowed'
                }`}
              >
                {a.can_attempt === false ? (
                  `No attempts remaining (${a.attempts_used}/${a.max_attempts})`
                ) : a.has_in_progress ? (
                  <>Resume Assessment <ArrowRight size={14} /></>
                ) : (
                  <>Start Assessment <ArrowRight size={14} /></>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── CSV Upload Modal ─────────────────────── */}
      {showUpload && (() => {
        const uploadAssessment = assessments.find(a => a.id === showUpload)
        const isCodingUpload = uploadAssessment?.category?.toLowerCase() === 'coding'
        return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(null)}>
          <div className="bg-surface-lowest rounded-2xl p-8 w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-on-surface">
                Upload {isCodingUpload ? 'Coding Problems' : 'Questions'} (CSV)
              </h2>
              <button onClick={() => setShowUpload(null)} className="p-1.5 text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
            </div>

            <div className="bg-surface-low rounded-xl p-4 mb-4 text-xs text-on-surface-variant">
              <p className="font-semibold text-on-surface mb-2">CSV Format ({isCodingUpload ? 'Coding' : 'MCQ'}):</p>
              {isCodingUpload ? (
                <>
                  <code className="block bg-surface-high rounded p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap">
                    title,description,input_format,output_format,constraints,sample_input,sample_output,explanation,difficulty,topic,time_limit,memory_limit,language,hidden_test_cases
                  </code>
                  <p className="mt-2">• difficulty must be: <code>easy</code>, <code>medium</code>, or <code>hard</code></p>
                  <p>• time_limit (seconds) and memory_limit (MB) must be numbers</p>
                  <p>• language: comma-separated (e.g. python,cpp,java)</p>
                  <p>• hidden_test_cases: JSON array</p>
                  <code className="block bg-surface-high rounded p-1.5 text-[9px] font-mono mt-1 overflow-x-auto">
                    {'[{"input":"1 2","output":"3"},{"input":"5 10","output":"15"}]'}
                  </code>
                </>
              ) : (
                <>
                  <code className="block bg-surface-high rounded p-2 text-[10px] font-mono overflow-x-auto">
                    question_text,option_a,option_b,option_c,option_d,correct_answer,explanation
                  </code>
                  <p className="mt-2">• correct_answer should be A, B, C, or D</p>
                  <p>• explanation is optional</p>
                </>
              )}
            </div>

            <input ref={fileRef} type="file" accept=".csv" className="input-minimal text-sm mb-4" />

            {uploadResult && (
              <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${
                uploadResult.success ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fef2f2] text-error'
              }`}>
                <div className="flex items-center gap-2">
                  {uploadResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  {uploadResult.message}
                </div>
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
                    {uploadResult.errors.map((e, i) => (
                      <p key={i} className="text-error/80">Row {e.row}: {e.message}</p>
                    ))}
                  </div>
                )}
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
        )
      })()}

      {/* ── Attempts/Violations Modal ─────────────────────── */}
      {showAttempts && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setShowAttempts(null); setSelectedAttempt(null); setAssessmentStats(null) }}>
          <div className="bg-surface-lowest rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Assessment Results & Attempts</h2>
                {assessmentStats?.assessment && <p className="text-xs text-on-surface-variant mt-0.5">{assessmentStats.assessment.title} — {assessmentStats.assessment.category}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadCSV(showAttempts)} title="Export CSV"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Download size={14} /> Export CSV
                </button>
                <button onClick={() => { setShowAttempts(null); setSelectedAttempt(null); setAssessmentStats(null) }} className="p-1.5 text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
              </div>
            </div>

            {/* ── Stats Summary ────── */}
            {assessmentStats?.stats && (
              <div className="mb-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-surface-low rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={14} className="text-primary" />
                      <span className="text-[10px] text-on-surface-variant uppercase">Total Attempts</span>
                    </div>
                    <p className="text-2xl font-bold text-on-surface">{assessmentStats.stats.total_attempts}</p>
                    <p className="text-[10px] text-on-surface-variant">{assessmentStats.stats.submitted_count} submitted, {assessmentStats.stats.in_progress_count} in progress</p>
                  </div>
                  <div className="bg-surface-low rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp size={14} className="text-[#22c55e]" />
                      <span className="text-[10px] text-on-surface-variant uppercase">Pass Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-on-surface">{assessmentStats.stats.pass_rate}%</p>
                    <p className="text-[10px] text-on-surface-variant">
                      <span className="text-[#22c55e] font-medium">{assessmentStats.stats.passed_count} passed</span> / <span className="text-error font-medium">{assessmentStats.stats.failed_count} failed</span>
                    </p>
                  </div>
                  <div className="bg-surface-low rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 size={14} className="text-[#3b82f6]" />
                      <span className="text-[10px] text-on-surface-variant uppercase">Avg Score</span>
                    </div>
                    <p className="text-2xl font-bold text-on-surface">{assessmentStats.stats.avg_score}%</p>
                    <p className="text-[10px] text-on-surface-variant">Range: {assessmentStats.stats.lowest_score}% — {assessmentStats.stats.highest_score}%</p>
                  </div>
                  <div className="bg-surface-low rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Award size={14} className="text-[#f59e0b]" />
                      <span className="text-[10px] text-on-surface-variant uppercase">Score Distribution</span>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {['0-20', '20-40', '40-60', '60-80', '80-100'].map((range, i) => {
                        const val = assessmentStats.stats.score_distribution?.[range] || 0
                        const maxVal = Math.max(...Object.values(assessmentStats.stats.score_distribution || {}))
                        const height = maxVal > 0 ? Math.max(4, (val / maxVal) * 28) : 4
                        const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-emerald-400']
                        return (
                          <div key={range} className="flex-1 flex flex-col items-center gap-0.5" title={`${range}%: ${val} students`}>
                            <div className={`${colors[i]} rounded-sm w-full transition-all`} style={{ height: `${height}px` }} />
                            <span className="text-[7px] text-on-surface-variant">{val}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between text-[7px] text-on-surface-variant mt-0.5">
                      <span>0%</span><span>100%</span>
                    </div>
                  </div>
                </div>

                {/* Top Scorers */}
                {assessmentStats.top_scorers?.length > 0 && (
                  <div className="bg-surface-low rounded-xl p-3 mb-3">
                    <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">🏆 Top Scorers</p>
                    <div className="flex flex-wrap gap-2">
                      {assessmentStats.top_scorers.slice(0, 5).map((s, i) => (
                        <div key={i} className="flex items-center gap-2 bg-surface-lowest rounded-lg px-3 py-1.5">
                          <span className={`text-xs font-bold ${i === 0 ? 'text-[#f59e0b]' : i === 1 ? 'text-[#94a3b8]' : i === 2 ? 'text-[#cd7f32]' : 'text-on-surface-variant'}`}>#{i + 1}</span>
                          <span className="text-xs font-medium text-on-surface">{s.name}</span>
                          <span className={`text-[10px] font-bold ${s.status === 'passed' ? 'text-[#22c55e]' : 'text-error'}`}>{s.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {['all', 'clean', 'cheating', 'invalidated'].map(f => (
                <button key={f} onClick={() => setAttemptFilter(f)}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-full transition-colors ${
                    attemptFilter === f
                      ? f === 'cheating' ? 'bg-error/15 text-error' : f === 'invalidated' ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/15 text-primary'
                      : 'bg-surface-high text-on-surface-variant hover:bg-surface-highest'
                  }`}>
                  {f === 'all' ? 'All' : f === 'clean' ? '✓ Clean' : f === 'cheating' ? '⚠ Cheating' : '↺ Reset'}
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
                {filteredAttempts.map(att => {
                  const passingMarks = assessmentStats?.assessment?.passing_marks || 50
                  const isPassed = att.status !== 'in_progress' && att.percentage >= passingMarks
                  const isFailed = att.status !== 'in_progress' && att.percentage < passingMarks && att.percentage != null
                  return (
                  <div key={att.id}>
                    <button onClick={() => setSelectedAttempt(selectedAttempt === att.id ? null : att.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors text-left ${
                        att.invalidated ? 'bg-surface-low/50 opacity-60' : 'bg-surface-low hover:bg-surface-high'
                      }`}>
                      {/* Student info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{att.profiles?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-on-surface-variant">{att.profiles?.email} • {att.profiles?.prn || 'N/A'} • {att.profiles?.department || ''}</p>
                      </div>
                      {/* Score */}
                      <div className="text-center shrink-0">
                        <p className={`text-lg font-bold ${isPassed ? 'text-[#22c55e]' : isFailed ? 'text-error' : 'text-on-surface'}`}>
                          {att.percentage != null ? `${att.percentage}%` : '—'}
                        </p>
                        <p className="text-[9px] text-on-surface-variant uppercase">{att.score ?? 0}/{att.total ?? 0}</p>
                      </div>
                      {/* Pass/Fail Badge */}
                      {att.status !== 'in_progress' && att.percentage != null && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isPassed ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fef2f2] text-error'
                        }`}>
                          {isPassed ? 'PASSED' : 'FAILED'}
                        </span>
                      )}
                      {/* Status */}
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                        att.invalidated ? 'bg-gray-200 text-gray-600' :
                        att.status === 'submitted' ? 'bg-[#dcfce7] text-[#166534]' :
                        att.status === 'auto_submitted' ? 'bg-[#fef2f2] text-error' :
                        att.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-[#fef3c7] text-[#92400e]'
                      }`}>
                        {att.invalidated ? 'RESET' : att.status === 'auto_submitted' ? 'Auto-submitted' : att.status}
                      </span>
                      {/* Violations */}
                      {att.violation_count > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-error bg-error/10 px-2 py-1 rounded-full shrink-0">
                          <AlertTriangle size={10} /> {att.violation_count}
                        </span>
                      )}
                      <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${selectedAttempt === att.id ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Expanded Details */}
                    {selectedAttempt === att.id && (
                      <div className="ml-4 mt-2 bg-surface-lowest rounded-xl p-4 border border-outline/10 animate-fade-in">
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-surface-low rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase">Submission Reason</p>
                            <p className="text-xs font-medium text-on-surface mt-0.5">{att.submission_reason || 'N/A'}</p>
                          </div>
                          <div className="bg-surface-low rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase">Started At</p>
                            <p className="text-xs font-medium text-on-surface mt-0.5">
                              {att.start_time ? new Date(att.start_time).toLocaleString() : att.created_at ? new Date(att.created_at).toLocaleString() : '—'}
                            </p>
                          </div>
                          <div className="bg-surface-low rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase">Submitted At</p>
                            <p className="text-xs font-medium text-on-surface mt-0.5">
                              {att.submitted_at ? new Date(att.submitted_at).toLocaleString() : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Invalidation info */}
                        {att.invalidated && (
                          <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200">
                            <p className="text-[10px] font-semibold text-amber-700 uppercase">Reset By Admin</p>
                            <p className="text-xs text-amber-800 mt-1">{att.invalidated_reason || 'No reason provided'}</p>
                          </div>
                        )}

                        {/* Violation Timeline */}
                        {att.warnings_log && att.warnings_log.length > 0 ? (
                          <div className="mb-4">
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
                          <p className="text-xs text-on-surface-variant mb-4">No violations recorded — clean attempt.</p>
                        )}

                        {/* Admin Actions */}
                        {isAdmin && !att.invalidated && (
                          <div className="pt-3 border-t border-outline/10">
                            {resetAttemptId === att.id ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  type="text"
                                  placeholder="Reason for reset (required)"
                                  value={resetReason}
                                  onChange={e => setResetReason(e.target.value)}
                                  className="input-minimal text-sm"
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => { setResetAttemptId(null); setResetReason('') }}
                                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-surface-high text-on-surface-variant hover:bg-surface-highest transition-colors">
                                    Cancel
                                  </button>
                                  <button onClick={handleResetAttempt} disabled={resetting || resetReason.trim().length < 3}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">
                                    {resetting ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><RotateCcw size={12} /> Confirm Reset</>}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setResetAttemptId(att.id)}
                                className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors">
                                <RotateCcw size={12} /> Reset Attempt (allow re-take)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create/Edit Assessment Modal ─────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-surface-lowest rounded-2xl p-6 w-full max-w-[640px] max-h-[92vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()} style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-on-surface">{editing ? 'Edit Assessment' : 'New Assessment'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-surface-low rounded-xl mb-6">
              {[
                { key: 'basic', label: 'Basic Details', icon: FileText },
                { key: 'config', label: 'Configuration', icon: Settings },
                { key: 'audience', label: 'Target Audience', icon: Users },
                { key: 'schedule', label: 'Scheduling', icon: Clock },
              ].map(tab => (
                <button key={tab.key} onClick={() => setFormTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all flex-1 justify-center ${
                    formTab === tab.key ? 'bg-surface-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}>
                  <tab.icon size={13} /> {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-5">
              {/* ─── TAB: Basic Details ─── */}
              {formTab === 'basic' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Title *</label>
                    <input type="text" className="input-minimal" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Description</label>
                    <textarea className="input-minimal resize-none" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Instructions for Students</label>
                    <textarea className="input-minimal resize-none" rows={3} placeholder="e.g., Do not switch tabs. No calculators allowed." value={form.instructions} onChange={e => setForm({...form, instructions: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Category *</label>
                      <select className="input-minimal" value={form.category} onChange={e => setForm({...form, category: e.target.value})} required>
                        <option>Aptitude</option><option>Coding</option><option>Communication</option>
                        <option>Technical</option><option>Reasoning</option><option>General Knowledge</option><option>Quantitative</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Difficulty</label>
                      <select className="input-minimal" value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value})}>
                        <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                </>
              )}

              {/* ─── TAB: Configuration ─── */}
              {formTab === 'config' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Duration (minutes) *</label>
                      <input type="number" className="input-minimal" min="1" value={form.duration_minutes} onChange={e => setForm({...form, duration_minutes: parseInt(e.target.value) || 60})} required />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Max Attempts</label>
                      <input type="number" className="input-minimal" min="1" max="10" value={form.max_attempts} onChange={e => setForm({...form, max_attempts: parseInt(e.target.value) || 1})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Total Marks</label>
                      <input type="number" className="input-minimal" min="0" value={form.total_marks} onChange={e => setForm({...form, total_marks: parseInt(e.target.value) || 0})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Passing Marks (%)</label>
                      <input type="number" className="input-minimal" min="0" max="100" value={form.passing_marks} onChange={e => setForm({...form, passing_marks: parseInt(e.target.value) || 0})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Exam Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['non_proctored', 'proctored'].map(et => (
                        <button key={et} type="button" onClick={() => setForm({...form, exam_type: et})}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${
                            form.exam_type === et ? 'border-primary bg-primary/5' : 'border-outline/20 hover:border-outline/40'
                          }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {et === 'proctored' ? <Shield size={16} className="text-amber-500" /> : <Eye size={16} className="text-green-500" />}
                            <span className="text-sm font-semibold text-on-surface capitalize">{et.replace('_', '-')}</span>
                          </div>
                          <p className="text-[10px] text-on-surface-variant">
                            {et === 'proctored' ? 'Tab switching, copy/paste blocked. Auto-submit after 3 violations.' : 'Standard exam without browser restrictions.'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Toggles */}
                  <div className="flex flex-col gap-3">
                    {[
                      { key: 'shuffle_questions', label: 'Shuffle Questions', desc: 'Randomize question order for each student' },
                      { key: 'shuffle_options', label: 'Shuffle Options', desc: 'Randomize option order (A/B/C/D) per question' },
                      { key: 'show_results_immediately', label: 'Show Results Immediately', desc: 'Students see score right after submission' },
                      { key: 'is_active', label: 'Active', desc: 'Assessment is visible and can be attempted by students' },
                    ].map(toggle => (
                      <label key={toggle.key} className="flex items-center justify-between p-3 bg-surface-low rounded-xl cursor-pointer group">
                        <div>
                          <p className="text-sm font-medium text-on-surface">{toggle.label}</p>
                          <p className="text-[10px] text-on-surface-variant">{toggle.desc}</p>
                        </div>
                        <div className="relative">
                          <input type="checkbox" className="sr-only" checked={form[toggle.key]} onChange={e => setForm({...form, [toggle.key]: e.target.checked})} />
                          <div className={`w-10 h-6 rounded-full transition-colors ${form[toggle.key] ? 'bg-primary' : 'bg-surface-highest'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${form[toggle.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {/* ─── TAB: Target Audience ─── */}
              {formTab === 'audience' && (
                <>
                  {/* Open to All toggle */}
                  <label className="flex items-center justify-between p-4 bg-surface-low rounded-xl cursor-pointer border-2 border-primary/20">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">Open to All Students</p>
                      <p className="text-[10px] text-on-surface-variant">All students can see and attempt, ignoring department/year/section filters</p>
                    </div>
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={form.open_to_all} onChange={e => setForm({...form, open_to_all: e.target.checked})} />
                      <div className={`w-10 h-6 rounded-full transition-colors ${form.open_to_all ? 'bg-primary' : 'bg-surface-highest'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${form.open_to_all ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                    </div>
                  </label>

                  {!form.open_to_all && (
                    <>
                      {/* Departments */}
                      <div>
                        <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Target Departments</label>
                        <div className="flex flex-wrap gap-2">
                          {DEPARTMENTS.map(d => (
                            <button key={d} type="button" onClick={() => toggleMulti('target_departments', d)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                form.target_departments.includes(d) ? 'bg-primary text-on-primary' : 'bg-surface-high text-on-surface-variant hover:bg-surface-highest'
                              }`}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Years */}
                      <div>
                        <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Target Years</label>
                        <div className="flex flex-wrap gap-2">
                          {YEARS.map(y => (
                            <button key={y} type="button" onClick={() => toggleMulti('target_years', y)}
                              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                                form.target_years.includes(y) ? 'bg-primary text-on-primary' : 'bg-surface-high text-on-surface-variant hover:bg-surface-highest'
                              }`}>
                              {y}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sections */}
                      <div>
                        <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Target Sections</label>
                        <div className="flex flex-wrap gap-2">
                          {SECTIONS.map(s => (
                            <button key={s} type="button" onClick={() => toggleMulti('target_sections', s)}
                              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                                form.target_sections.includes(s) ? 'bg-primary text-on-primary' : 'bg-surface-high text-on-surface-variant hover:bg-surface-highest'
                              }`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {form.target_departments.length === 0 && form.target_years.length === 0 && form.target_sections.length === 0 && (
                        <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">⚠ No filters selected. If "Open to All" is off, no students will see this exam.</p>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ─── TAB: Scheduling ─── */}
              {formTab === 'schedule' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Start Date & Time</label>
                      <input type="datetime-local" className="input-minimal" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">End Date & Time</label>
                      <input type="datetime-local" className="input-minimal" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} />
                    </div>
                  </div>

                  <p className="text-[10px] text-on-surface-variant -mt-3">
                    If only start time is set, end time will be auto-calculated as start + duration.
                    If both are empty, the exam is available any time.
                  </p>

                  <label className="flex items-center justify-between p-3 bg-surface-low rounded-xl cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-on-surface">Allow Late Entry</p>
                      <p className="text-[10px] text-on-surface-variant">Students can start after the scheduled end time</p>
                    </div>
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={form.allow_late_entry} onChange={e => setForm({...form, allow_late_entry: e.target.checked})} />
                      <div className={`w-10 h-6 rounded-full transition-colors ${form.allow_late_entry ? 'bg-primary' : 'bg-surface-highest'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${form.allow_late_entry ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                    </div>
                  </label>

                  {form.allow_late_entry && (
                    <div>
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Late Entry Buffer (minutes)</label>
                      <input type="number" className="input-minimal" min="0" max="120" value={form.late_entry_minutes} onChange={e => setForm({...form, late_entry_minutes: parseInt(e.target.value) || 0})} />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Expires At (legacy, optional)</label>
                    <input type="datetime-local" className="input-minimal" value={form.expires_at ? (typeof form.expires_at === 'string' ? form.expires_at.slice(0, 16) : '') : ''} onChange={e => setForm({...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : ''})} />
                  </div>
                </>
              )}

              {/* Submit Button */}
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
