import { useState } from 'react'
import { Send, CheckCircle2, User, Mail, Hash, Building2 } from 'lucide-react'
import useAuthStore from '../store/authStore'
import api from '../services/api'

export default function Support() {
  const user = useAuthStore((s) => s.user)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('Message is required')
      return
    }
    if (message.trim().length < 10) {
      setError('Message must be at least 10 characters')
      return
    }

    setLoading(true)
    setError('')
    try {
      await api.post('/support', { message: message.trim() })
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit ticket')
    }
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center animate-fade-in max-w-[400px]">
          <div className="w-16 h-16 rounded-2xl bg-[#dcfce7] flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-[#166534]" />
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">Message Sent</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
            Thank you for reaching out. Our support team will review your inquiry and respond within 24–48 hours.
          </p>
          <button
            onClick={() => { setSubmitted(false); setMessage('') }}
            className="btn-gradient px-6 py-2.5 rounded-[10px] text-sm font-medium"
          >
            Send Another Message
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Help Center</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Contact Support</h1>
        <p className="text-sm text-on-surface-variant mt-1">Have a question or facing an issue? We're here to help.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-surface-lowest rounded-xl p-6 md:p-8" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            {/* Student Info Display — auto-populated from profile */}
            <div className="mb-6">
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-3">Your Information (from profile)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 bg-surface-low rounded-lg px-4 py-3">
                  <User size={14} className="text-on-surface-variant shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Name</p>
                    <p className="text-xs font-medium text-on-surface truncate">{user?.name || 'Not set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-surface-low rounded-lg px-4 py-3">
                  <Mail size={14} className="text-on-surface-variant shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Email</p>
                    <p className="text-xs font-medium text-on-surface truncate">{user?.email || 'Not set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-surface-low rounded-lg px-4 py-3">
                  <Hash size={14} className="text-on-surface-variant shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">PRN</p>
                    <p className="text-xs font-medium text-on-surface">{user?.prn || 'Not set'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 bg-surface-low rounded-lg px-4 py-3">
                  <Building2 size={14} className="text-on-surface-variant shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Department</p>
                    <p className="text-xs font-medium text-on-surface">{user?.department || 'Not set'}{user?.year ? ` · ${user.year} Year` : ''}{user?.division ? ` · Div ${user.division}` : ''}</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant/60 mt-2">This information is automatically included with your ticket from your profile.</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Your Message *</label>
                <textarea
                  className={`input-minimal resize-none ${error ? 'border-b-error' : ''}`}
                  rows={5}
                  placeholder="Describe your issue or question in detail..."
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); if (error) setError('') }}
                />
                {error && <p className="text-xs text-error mt-1">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-gradient py-3 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 w-full sm:w-auto sm:px-8 self-start"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={14} />
                    Submit Request
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <h3 className="text-sm font-semibold text-on-surface mb-3">Response Time</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Our support team typically responds within <strong className="text-on-surface">24–48 hours</strong> on business days.
            </p>
          </div>
          <div className="bg-surface-lowest rounded-xl p-6" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <h3 className="text-sm font-semibold text-on-surface mb-3">Common Issues</h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {['Assessment not loading', 'Score discrepancy', 'Account access issues', 'Technical difficulties', 'Schedule conflicts'].map((item) => (
                <li key={item} className="text-xs text-on-surface-variant flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-primary-fixed rounded-xl p-6">
            <h3 className="text-sm font-semibold text-primary mb-2">Email Support</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              For urgent matters, email us directly at{' '}
              <a href="mailto:support@sanjivani.edu" className="text-primary font-medium no-underline hover:underline">
                support@sanjivani.edu
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
