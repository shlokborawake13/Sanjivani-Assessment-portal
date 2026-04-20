import { Link } from 'react-router-dom'
import { ArrowRight, Brain, Code, MessageCircle, Shield, TrendingUp, Users, Zap, ChevronRight } from 'lucide-react'
import useAuthStore from '../store/authStore'

const features = [
  { icon: Brain, title: 'Aptitude Assessment', desc: 'Quantitative reasoning, logical analysis, and verbal proficiency evaluation calibrated for academic excellence.' },
  { icon: Code, title: 'Coding Proficiency', desc: 'Data structures, algorithms, and problem-solving across multiple languages with real-time evaluation.' },
  { icon: MessageCircle, title: 'Communication Skills', desc: 'Written expression, comprehension, and professional communication assessment framework.' },
]

const stats = [
  { value: '14,200+', label: 'Students Assessed' },
  { value: '98%', label: 'Satisfaction Rate' },
  { value: '50+', label: 'Assessment Modules' },
  { value: '24/7', label: 'Platform Availability' },
]

const principles = [
  { icon: Shield, title: 'Academic Integrity', desc: 'Proctored environments and rigorous anti-plagiarism measures ensure authentic evaluations.' },
  { icon: TrendingUp, title: 'Continuous Improvement', desc: 'Detailed analytics and trend tracking help students identify growth opportunities.' },
  { icon: Users, title: 'Inclusive Design', desc: 'Accessible assessments designed for diverse learning styles and capabilities.' },
  { icon: Zap, title: 'Instant Feedback', desc: 'Real-time scoring and detailed explanations accelerate the learning cycle.' },
]

export default function Landing() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return (
    <div className="bg-surface">
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.02]" />
        <div className="max-w-[1200px] mx-auto px-6 pt-24 pb-20 md:pt-32 md:pb-28 relative">
          <div className="max-w-[680px]" style={{ marginLeft: '0', marginRight: 'auto' }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-fixed text-primary text-xs font-semibold mb-6 animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-soft" />
              Assessment Portal — Now Live
            </div>
            <h1 className="text-4xl md:text-[3.5rem] font-bold text-on-surface leading-[1.1] mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              Precision in
              <br />
              <span className="bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">
                Intelligence
              </span>
            </h1>
            <p className="text-lg text-on-surface-variant leading-relaxed mb-8 max-w-[520px] animate-fade-in" style={{ animationDelay: '0.2s' }}>
              Empowering the next generation of professionals at Sanjivani CareerSpace. A clinical assessment ecosystem where academic rigor meets cutting-edge evaluation.
            </p>
            <div className="flex flex-wrap gap-3 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              {isAuthenticated ? (
                <>
                  <Link
                    to="/assessments"
                    className="btn-accent px-7 py-3 rounded-[10px] text-sm font-semibold no-underline flex items-center gap-2"
                  >
                    Begin Your Assessment
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/dashboard"
                    className="px-7 py-3 rounded-[10px] text-sm font-medium text-primary no-underline border border-outline/30 hover:bg-surface-high transition-colors duration-200"
                  >
                    Go to Dashboard
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="btn-accent px-7 py-3 rounded-[10px] text-sm font-semibold no-underline flex items-center gap-2"
                  >
                    Begin Your Assessment
                    <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/login"
                    className="px-7 py-3 rounded-[10px] text-sm font-medium text-primary no-underline border border-outline/30 hover:bg-surface-high transition-colors duration-200"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="bg-surface-lowest" style={{ boxShadow: 'var(--shadow-ambient-sm)' }}>
        <div className="max-w-[1200px] mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-primary mb-1">{stat.value}</p>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About Section ── */}
      <section id="about" className="bg-surface-low">
        <div className="max-w-[1200px] mx-auto px-6 py-20 md:py-28">
          <div className="max-w-[600px] mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-3">The Clinical Curator</p>
            <h2 className="text-3xl md:text-4xl font-bold text-on-surface leading-tight mb-5">
              An Ecosystem of <br className="hidden md:block" />Rigorous Evaluation
            </h2>
            <p className="text-base text-on-surface-variant leading-relaxed">
              Sanjivani CareerSpace is not just a testing platform — it is a precision-driven ecosystem designed for rigorous academic and practical evaluation, ensuring every student achieves their highest potential.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
            {principles.map((p) => {
              const Icon = p.icon
              return (
                <div key={p.title} className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                  <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center mb-4">
                    <Icon size={18} className="text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2">{p.title}</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{p.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Assessments Section ── */}
      <section id="assessments" className="bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 py-20 md:py-28">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-3">Assessment Modules</p>
              <h2 className="text-3xl md:text-4xl font-bold text-on-surface">Featured Assessments</h2>
            </div>
            <Link to={isAuthenticated ? '/assessments' : '/register'} className="hidden md:flex items-center gap-1.5 text-sm font-medium text-primary no-underline hover:gap-2.5 transition-all duration-200">
              View All <ChevronRight size={14} />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8 stagger-children">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="bg-surface-lowest rounded-xl p-8 group transition-all duration-300 hover:translate-y-[-2px]" style={{ boxShadow: 'var(--shadow-ambient)' }}>
                  <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-105">
                    <Icon size={22} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-on-surface mb-3">{f.title}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-5">{f.desc}</p>
                  <Link
                    to={isAuthenticated ? '/assessments' : '/register'}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary no-underline hover:gap-2.5 transition-all duration-200"
                  >
                    Start Now <ArrowRight size={14} />
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      {isAuthenticated ? (
        <section className="btn-gradient">
          <div className="max-w-[1200px] mx-auto px-6 py-20 md:py-24 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-on-primary mb-5">
              Continue Your Journey
            </h2>
            <p className="text-base text-primary-fixed-dim max-w-[480px] mx-auto mb-8 leading-relaxed">
              Track your progress, take assessments, and climb the leaderboard. Your dashboard is waiting.
            </p>
            <Link to="/dashboard" className="btn-accent px-8 py-3.5 rounded-[10px] text-sm font-semibold no-underline inline-flex items-center gap-2">
              Go to Dashboard
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : (
        <section className="btn-gradient">
          <div className="max-w-[1200px] mx-auto px-6 py-20 md:py-24 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-on-primary mb-5">
              Ready to Assess Your Potential?
            </h2>
            <p className="text-base text-primary-fixed-dim max-w-[480px] mx-auto mb-8 leading-relaxed">
              Join thousands of students building their academic and professional profile through rigorous, fair assessments.
            </p>
            <Link to="/register" className="btn-accent px-8 py-3.5 rounded-[10px] text-sm font-semibold no-underline inline-flex items-center gap-2">
              Create Free Account
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
