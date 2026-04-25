import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Filter, Download, RotateCcw, ChevronDown, X, AlertTriangle,
  Users, TrendingUp, BarChart3, Award, Clock, Shield, Eye, ArrowLeft,
  CheckCircle2, XCircle, RefreshCw
} from 'lucide-react'
import api from '../services/api'

export default function AdminAttempts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedAssessmentId = searchParams.get('assessment')

  // Data
  const [assessments, setAssessments] = useState([])
  const [attempts, setAttempts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [attemptsLoading, setAttemptsLoading] = useState(false)

  // Filters
  const [selectedAssessment, setSelectedAssessment] = useState(preselectedAssessmentId || '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [resultFilter, setResultFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showInvalidated, setShowInvalidated] = useState(false)

  // Expansion & Reset
  const [expandedAttempt, setExpandedAttempt] = useState(null)
  const [resetAttemptId, setResetAttemptId] = useState(null)
  const [resetReason, setResetReason] = useState('')
  const [resetting, setResetting] = useState(false)

  // Load assessments on mount
  useEffect(() => {
    api.get('/assessments')
      .then(res => setAssessments(res.data.assessments || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Load attempts when assessment changes
  useEffect(() => {
    if (selectedAssessment) {
      loadAttempts(selectedAssessment)
    } else {
      loadAllAttempts()
    }
  }, [selectedAssessment, showInvalidated])

  const loadAttempts = async (assessmentId) => {
    setAttemptsLoading(true)
    setStats(null)
    try {
      const [attRes, statsRes] = await Promise.allSettled([
        api.get(`/admin/attempts?assessment_id=${assessmentId}&include_invalidated=${showInvalidated}`),
        api.get(`/admin/assessments/${assessmentId}/stats`)
      ])
      if (attRes.status === 'fulfilled') setAttempts(attRes.value.data.attempts || [])
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
    } catch (err) {
      console.error('Load attempts error:', err)
    }
    setAttemptsLoading(false)
  }

  const loadAllAttempts = async () => {
    setAttemptsLoading(true)
    setStats(null)
    try {
      const { data } = await api.get(`/admin/attempts?include_invalidated=${showInvalidated}`)
      setAttempts(data.attempts || [])
    } catch (err) {
      console.error('Load all attempts error:', err)
    }
    setAttemptsLoading(false)
  }

  // Reset attempt
  const handleResetAttempt = async () => {
    if (!resetAttemptId || !resetReason.trim() || resetReason.trim().length < 3) return
    setResetting(true)
    try {
      await api.post(`/admin/attempts/${resetAttemptId}/reset`, { reason: resetReason.trim() })
      setAttempts(prev => prev.map(a => a.id === resetAttemptId ? { ...a, invalidated: true, invalidated_reason: resetReason.trim() } : a))
      setResetAttemptId(null)
      setResetReason('')
    } catch (err) {
      alert(err.response?.data?.error || 'Reset failed')
    }
    setResetting(false)
  }

  // Download CSV
  const downloadCSV = async () => {
    if (!selectedAssessment) return alert('Please select an assessment first')
    try {
      const sessionStr = localStorage.getItem('sanjivani_session')
      const session = sessionStr ? JSON.parse(sessionStr) : null
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/admin/assessments/${selectedAssessment}/export-csv`, {
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

  // Filter logic
  const filteredAttempts = attempts.filter(att => {
    // Status filter
    if (statusFilter === 'submitted' && att.status !== 'submitted' && att.status !== 'auto_submitted') return false
    if (statusFilter === 'in_progress' && att.status !== 'in_progress') return false
    if (statusFilter === 'auto_submitted' && att.status !== 'auto_submitted') return false

    // Result filter
    const passingMarks = stats?.assessment?.passing_marks || 50
    if (resultFilter === 'passed' && (att.status === 'in_progress' || att.percentage < passingMarks)) return false
    if (resultFilter === 'failed' && (att.status === 'in_progress' || att.percentage >= passingMarks)) return false

    // Invalidated filter
    if (!showInvalidated && att.invalidated) return false

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const name = (att.profiles?.name || '').toLowerCase()
      const email = (att.profiles?.email || '').toLowerCase()
      const prn = (att.profiles?.prn || '').toLowerCase()
      const dept = (att.profiles?.department || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q) && !prn.includes(q) && !dept.includes(q)) return false
    }

    return true
  })

  // Get assessment title
  const getAssessmentTitle = (att) => {
    return att.assessments?.title || assessments.find(a => a.id === att.assessment_id)?.title || 'Unknown'
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high transition-colors">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-2xl font-bold text-on-surface">Student Attempts</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-10">View, analyze, and manage all student assessment attempts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => selectedAssessment ? loadAttempts(selectedAssessment) : loadAllAttempts()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-high text-on-surface-variant hover:bg-surface-highest transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={downloadCSV} disabled={!selectedAssessment}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-surface-lowest rounded-2xl p-4 mb-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Assessment Selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 block">Assessment</label>
            <select value={selectedAssessment} onChange={e => setSelectedAssessment(e.target.value)}
              className="w-full bg-surface-low text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline/10 focus:border-primary/40 focus:outline-none transition-colors">
              <option value="">All Assessments</option>
              {assessments.map(a => (
                <option key={a.id} value={a.id}>{a.title} ({a.category})</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 block">Search Student</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input type="text" placeholder="Name, email, PRN, department..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface-low text-on-surface text-sm rounded-lg pl-9 pr-3 py-2.5 border border-outline/10 focus:border-primary/40 focus:outline-none transition-colors placeholder:text-on-surface-variant/50" />
            </div>
          </div>

          {/* Status Filter */}
          <div className="min-w-[140px]">
            <label className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 block">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="w-full bg-surface-low text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline/10 focus:border-primary/40 focus:outline-none transition-colors">
              <option value="all">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="auto_submitted">Auto-Submitted</option>
              <option value="in_progress">In Progress</option>
            </select>
          </div>

          {/* Result Filter */}
          <div className="min-w-[120px]">
            <label className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1 block">Result</label>
            <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
              className="w-full bg-surface-low text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline/10 focus:border-primary/40 focus:outline-none transition-colors">
              <option value="all">All Results</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Show Invalidated */}
          <label className="flex items-center gap-2 cursor-pointer pb-1">
            <input type="checkbox" checked={showInvalidated} onChange={e => setShowInvalidated(e.target.checked)}
              className="w-4 h-4 rounded border-outline/30 text-primary focus:ring-primary/20" />
            <span className="text-xs text-on-surface-variant whitespace-nowrap">Show Reset</span>
          </label>
        </div>
      </div>

      {/* Stats Cards (only when a specific assessment is selected) */}
      {stats?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-surface-lowest rounded-xl p-4" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-primary" />
              <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Total Attempts</span>
            </div>
            <p className="text-3xl font-bold text-on-surface">{stats.stats.total_attempts}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">{stats.stats.submitted_count} submitted • {stats.stats.in_progress_count} in progress</p>
          </div>

          <div className="bg-surface-lowest rounded-xl p-4" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-[#22c55e]" />
              <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Pass Rate</span>
            </div>
            <p className="text-3xl font-bold text-on-surface">{stats.stats.pass_rate}%</p>
            <p className="text-[10px] text-on-surface-variant mt-1">
              <span className="text-[#22c55e] font-medium">{stats.stats.passed_count} passed</span> • <span className="text-error font-medium">{stats.stats.failed_count} failed</span>
            </p>
          </div>

          <div className="bg-surface-lowest rounded-xl p-4" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={16} className="text-[#3b82f6]" />
              <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Average Score</span>
            </div>
            <p className="text-3xl font-bold text-on-surface">{stats.stats.avg_score}%</p>
            <p className="text-[10px] text-on-surface-variant mt-1">Range: {stats.stats.lowest_score}% — {stats.stats.highest_score}%</p>
          </div>

          <div className="bg-surface-lowest rounded-xl p-4" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Award size={16} className="text-[#f59e0b]" />
              <span className="text-[10px] text-on-surface-variant uppercase font-semibold">Score Distribution</span>
            </div>
            <div className="flex gap-0.5 items-end mt-1" style={{ height: '40px' }}>
              {['0-20', '20-40', '40-60', '60-80', '80-100'].map((range, i) => {
                const val = stats.stats.score_distribution?.[range] || 0
                const maxVal = Math.max(...Object.values(stats.stats.score_distribution || {}), 1)
                const height = Math.max(4, (val / maxVal) * 36)
                const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-emerald-400']
                return (
                  <div key={range} className="flex-1 flex flex-col items-center gap-0.5" title={`${range}%: ${val} students`}>
                    <span className="text-[8px] text-on-surface-variant font-medium">{val}</span>
                    <div className={`${colors[i]} rounded-sm w-full transition-all`} style={{ height: `${height}px` }} />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[8px] text-on-surface-variant mt-1">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          {/* Top 3 Scorers */}
          <div className="bg-surface-lowest rounded-xl p-4 col-span-2 sm:col-span-4 lg:col-span-1" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Award size={16} className="text-[#f59e0b]" />
              <span className="text-[10px] text-on-surface-variant uppercase font-semibold">🏆 Top Scorers</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {(stats.top_scorers || []).slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-[#f59e0b]' : i === 1 ? 'text-[#94a3b8]' : 'text-[#cd7f32]'}`}>#{i + 1}</span>
                  <span className="text-xs font-medium text-on-surface truncate flex-1">{s.name}</span>
                  <span className={`text-xs font-bold ${s.status === 'passed' ? 'text-[#22c55e]' : 'text-error'}`}>{s.percentage}%</span>
                </div>
              ))}
              {(!stats.top_scorers || stats.top_scorers.length === 0) && (
                <p className="text-xs text-on-surface-variant">No submissions yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attempts Table */}
      <div className="bg-surface-lowest rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-ambient)' }}>
        {/* Table Header */}
        <div className="px-5 py-3 border-b border-outline/10 flex items-center justify-between">
          <p className="text-sm font-semibold text-on-surface">
            {filteredAttempts.length} attempt{filteredAttempts.length !== 1 ? 's' : ''}
            {searchQuery && <span className="text-on-surface-variant font-normal"> matching "{searchQuery}"</span>}
          </p>
        </div>

        {attemptsLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredAttempts.length === 0 ? (
          <div className="text-center py-16">
            <Users size={40} className="mx-auto text-on-surface-variant/30 mb-3" />
            <p className="text-sm text-on-surface-variant">No attempts found</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">Try adjusting your filters or selecting a different assessment</p>
          </div>
        ) : (
          <div className="divide-y divide-outline/5">
            {filteredAttempts.map(att => {
              const passingMarks = stats?.assessment?.passing_marks || 50
              const isPassed = att.status !== 'in_progress' && att.percentage != null && att.percentage >= passingMarks
              const isFailed = att.status !== 'in_progress' && att.percentage != null && att.percentage < passingMarks
              const isExpanded = expandedAttempt === att.id

              return (
                <div key={att.id} className={att.invalidated ? 'opacity-50' : ''}>
                  {/* Row */}
                  <button
                    onClick={() => setExpandedAttempt(isExpanded ? null : att.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-low/50 transition-colors text-left"
                  >
                    {/* Student */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{att.profiles?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-on-surface-variant truncate">
                        {att.profiles?.email} • PRN: {att.profiles?.prn || 'N/A'} • {att.profiles?.department || '—'}
                      </p>
                    </div>

                    {/* Assessment (only when viewing all) */}
                    {!selectedAssessment && (
                      <div className="hidden sm:block w-[150px] shrink-0">
                        <p className="text-xs font-medium text-on-surface truncate">{getAssessmentTitle(att)}</p>
                        <p className="text-[9px] text-on-surface-variant">{att.assessments?.category || ''}</p>
                      </div>
                    )}

                    {/* Score */}
                    <div className="text-center w-[70px] shrink-0">
                      <p className={`text-lg font-bold ${isPassed ? 'text-[#22c55e]' : isFailed ? 'text-error' : 'text-on-surface'}`}>
                        {att.percentage != null ? `${att.percentage}%` : '—'}
                      </p>
                      <p className="text-[9px] text-on-surface-variant">{att.score ?? 0}/{att.total ?? 0}</p>
                    </div>

                    {/* Pass/Fail */}
                    {att.percentage != null && att.status !== 'in_progress' && (
                      <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
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
                      {att.invalidated ? 'RESET' : att.status === 'auto_submitted' ? 'Auto-Sub' : att.status === 'in_progress' ? 'Active' : 'Submitted'}
                    </span>

                    {/* Violations */}
                    {(att.violation_count || 0) > 0 && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-error bg-error/10 px-2 py-1 rounded-full shrink-0">
                        <AlertTriangle size={10} /> {att.violation_count}
                      </span>
                    )}

                    <ChevronDown size={14} className={`text-on-surface-variant transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-5 pb-4 animate-fade-in">
                      <div className="bg-surface-low rounded-xl p-4 border border-outline/5">
                        {/* Detail Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          <div className="bg-surface-lowest rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Submission Reason</p>
                            <p className="text-xs font-medium text-on-surface mt-1">{att.submission_reason || 'N/A'}</p>
                          </div>
                          <div className="bg-surface-lowest rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Started At</p>
                            <p className="text-xs font-medium text-on-surface mt-1">
                              {att.start_time ? new Date(att.start_time).toLocaleString() : att.created_at ? new Date(att.created_at).toLocaleString() : '—'}
                            </p>
                          </div>
                          <div className="bg-surface-lowest rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Submitted At</p>
                            <p className="text-xs font-medium text-on-surface mt-1">
                              {att.submitted_at ? new Date(att.submitted_at).toLocaleString() : '—'}
                            </p>
                          </div>
                          <div className="bg-surface-lowest rounded-lg p-3">
                            <p className="text-[10px] text-on-surface-variant uppercase font-semibold">Violations</p>
                            <p className={`text-xs font-bold mt-1 ${(att.violation_count || 0) > 0 ? 'text-error' : 'text-[#22c55e]'}`}>
                              {att.violation_count || 0} {(att.violation_count || 0) === 0 ? '— Clean' : 'recorded'}
                            </p>
                          </div>
                        </div>

                        {/* Student Detail */}
                        <div className="bg-surface-lowest rounded-lg p-3 mb-4">
                          <p className="text-[10px] font-semibold text-on-surface-variant uppercase mb-2">Student Details</p>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                            <div><span className="text-on-surface-variant">Name:</span> <span className="font-medium text-on-surface">{att.profiles?.name}</span></div>
                            <div><span className="text-on-surface-variant">PRN:</span> <span className="font-medium text-on-surface">{att.profiles?.prn || '—'}</span></div>
                            <div><span className="text-on-surface-variant">Dept:</span> <span className="font-medium text-on-surface">{att.profiles?.department || '—'}</span></div>
                            <div><span className="text-on-surface-variant">Year:</span> <span className="font-medium text-on-surface">{att.profiles?.year || '—'}</span></div>
                            <div><span className="text-on-surface-variant">Section:</span> <span className="font-medium text-on-surface">{att.profiles?.section || '—'}</span></div>
                            <div><span className="text-on-surface-variant">Email:</span> <span className="font-medium text-on-surface truncate">{att.profiles?.email}</span></div>
                          </div>
                        </div>

                        {/* Invalidation Info */}
                        {att.invalidated && (
                          <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200">
                            <p className="text-[10px] font-semibold text-amber-700 uppercase">Reset By Admin</p>
                            <p className="text-xs text-amber-800 mt-1">{att.invalidated_reason || 'No reason provided'}</p>
                          </div>
                        )}

                        {/* Violation Timeline */}
                        {att.warnings_log && att.warnings_log.length > 0 && (
                          <div className="mb-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Violation Timeline</p>
                            <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
                              {att.warnings_log.map((w, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs bg-surface-lowest rounded-lg px-3 py-2">
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
                        )}

                        {/* Admin Actions */}
                        {!att.invalidated && (
                          <div className="pt-3 border-t border-outline/10">
                            {resetAttemptId === att.id ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  type="text"
                                  placeholder="Reason for reset (min 3 characters)"
                                  value={resetReason}
                                  onChange={e => setResetReason(e.target.value)}
                                  className="w-full bg-surface-lowest text-on-surface text-sm rounded-lg px-3 py-2.5 border border-outline/10 focus:border-primary/40 focus:outline-none"
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
                                <RotateCcw size={12} /> Reset Attempt (allow student to re-take)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
