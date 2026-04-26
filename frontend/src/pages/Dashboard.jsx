import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { BarChart3, ClipboardList, TrendingUp, Target, Sparkles, ArrowRight, Clock, Flame } from 'lucide-react'
import useAuthStore from '../store/authStore'
import StatCard from '../components/StatCard'
import AssessmentCard from '../components/AssessmentCard'
import AnnouncementCard from '../components/AnnouncementCard'
import Leaderboard from '../components/Leaderboard'
import api from '../services/api'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  // Read streak directly from user profile (already updated by authStore checkin)
  const streak = user?.current_streak || 0

  useEffect(() => {
    async function fetchData() {
      try {
        const [assessRes, announceRes, statsRes] = await Promise.allSettled([
          api.get('/assessments'),
          api.get('/announcements'),
          api.get('/results/stats')
        ])
        if (assessRes.status === 'fulfilled') setAssessments(assessRes.value.data.assessments || [])
        if (announceRes.status === 'fulfilled') setAnnouncements(announceRes.value.data.announcements || [])
        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.stats || null)
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const totalAssessments = stats?.totalAttempts || 0
  const avgScore = stats?.avgScore || 0
  const bestScore = stats?.bestScore || 0

  // Pick practice of the day from available aptitude assessments, or fallback
  const aptitudeAssessments = assessments.filter(a => a.category === 'Aptitude' && a.status === 'available')
  const practiceOfTheDay = aptitudeAssessments.length > 0 ? {
    id: aptitudeAssessments[0].id,
    title: aptitudeAssessments[0].title,
    category: aptitudeAssessments[0].category,
    description: aptitudeAssessments[0].description || 'Strengthen your aptitude skills with this practice session.',
    estimatedTime: aptitudeAssessments[0].duration || '15 min',
  } : {
    title: 'Logical Sequence Patterns',
    category: 'Aptitude',
    description: 'Identify the next element in complex number and shape sequences. Strengthen your pattern recognition.',
    estimatedTime: '15 min',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-on-surface mb-1">
              Welcome back, <span className="bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">{user?.name?.split(' ')?.[0] || 'Student'}</span>
            </h1>
            <p className="text-sm text-on-surface-variant">
              Here's an overview of your assessment journey. Keep pushing forward.
            </p>
          </div>
          {/* Streak Badge */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-[#ea580c]/10 to-[#f97316]/10 px-4 py-2.5 rounded-xl">
            <Flame size={20} className="text-[#ea580c]" />
            <div>
              <p className="text-lg font-bold text-[#ea580c]">{streak}</p>
              <p className="text-[10px] text-[#ea580c]/70 font-medium leading-none">Day Streak</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        <StatCard label="Assessments Taken" value={totalAssessments} change={12} icon={ClipboardList} color="#1e3a8a" />
        <StatCard label="Average Score" value={`${avgScore}%`} change={5} icon={BarChart3} color="#00236f" />
        <StatCard label="Best Performance" value={`${bestScore}%`} change={8} icon={TrendingUp} color="#166534" />
        <StatCard label="Current Streak" value={`${streak} days`} change={0} icon={Target} color="#533c00" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Practice of the Day */}
        <div className="lg:col-span-2">
          <div className="bg-surface-lowest rounded-xl p-6 h-full" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={16} className="text-accent" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-accent">Practice of the Day</h2>
            </div>
            <div className="bg-gradient-to-br from-primary/[0.03] to-accent/[0.02] rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary-fixed text-primary">
                  {practiceOfTheDay.category}
                </span>
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <Clock size={12} />
                  {practiceOfTheDay.estimatedTime}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-on-surface mb-2">{practiceOfTheDay.title}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-5">{practiceOfTheDay.description}</p>
              <button
                onClick={() => {
                  if (practiceOfTheDay.id) {
                    const cat = (practiceOfTheDay.category || '').toLowerCase()
                    if (cat === 'coding') navigate(`/assessment/${practiceOfTheDay.id}/code`)
                    else if (cat === 'communication') navigate(`/assessment/${practiceOfTheDay.id}/communicate`)
                    else navigate(`/assessment/${practiceOfTheDay.id}/take`)
                  }
                  else navigate('/assessments/aptitude')
                }}
                className="btn-gradient px-5 py-2.5 rounded-[10px] text-sm font-medium flex items-center gap-2 group"
              >
                Start Practice
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Announcements */}
        <div>
          <div className="bg-surface-lowest rounded-xl p-6 h-full" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-5">Announcements</h2>
            <div className="flex flex-col gap-3">
              {announcements.length > 0 ? announcements.slice(0, 3).map((a) => (
                <AnnouncementCard key={a.id} announcement={a} />
              )) : (
                <p className="text-sm text-on-surface-variant">No announcements yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assessment Cards + Leaderboard side by side */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Assessment Cards */}
        <div className="lg:col-span-2">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Assessment Modules</p>
              <h2 className="text-xl font-bold text-on-surface">Available Assessments</h2>
            </div>
            <Link to="/assessments/all" className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 no-underline">
              View All <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 stagger-children">
            {assessments.filter(a => a.status === 'available').slice(0, 4).map((a) => (
              <AssessmentCard key={a.id} assessment={a} />
            ))}
            {assessments.filter(a => a.status === 'available').length === 0 && (
              <p className="text-sm text-on-surface-variant col-span-full">No assessments available yet.</p>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <Leaderboard compact={true} />
        </div>
      </div>
    </div>
  )
}
