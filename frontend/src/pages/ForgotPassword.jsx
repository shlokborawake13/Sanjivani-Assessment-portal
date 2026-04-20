import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle2, Send } from 'lucide-react'
import api from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset email. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12 bg-surface-low">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="bg-surface-lowest rounded-2xl p-8 md:p-10" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/logo.png" alt="Sanjivani CareerSpace Logo" className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-semibold text-on-surface leading-tight">Sanjivani CareerSpace</h1>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Assessment Portal</p>
            </div>
          </div>

          {sent ? (
            /* Success State */
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} className="text-[#166534]" />
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-2">Check your email</h2>
              <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                If an account exists for <strong className="text-on-surface">{email}</strong>, 
                we've sent a password reset link. Please check your inbox and spam folder.
              </p>
              <div className="bg-surface-low rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <Mail size={14} className="text-primary shrink-0" />
                  <span>The link will expire in 1 hour</span>
                </div>
              </div>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="text-sm text-primary font-medium hover:underline"
              >
                Didn't receive it? Try again
              </button>
            </div>
          ) : (
            /* Form State */
            <>
              <h2 className="text-xl font-bold text-on-surface mb-1">Forgot your password?</h2>
              <p className="text-sm text-on-surface-variant mb-8">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              {error && (
                <div className="bg-error-container rounded-lg px-4 py-3 mb-6 text-sm text-error font-medium animate-fade-in">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      className="input-minimal pl-10"
                      placeholder="student@sanjivani.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient py-3 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={16} />
                      Send Reset Link
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-8 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-primary font-medium no-underline hover:underline"
            >
              <ArrowLeft size={14} />
              Back to Sign In
            </Link>
          </div>
        </div>

        <p className="text-[10px] text-on-surface-variant/60 text-center mt-6">
          © 2026 Sanjivani CareerSpace. Precision in Intelligence.
        </p>
      </div>
    </div>
  )
}
