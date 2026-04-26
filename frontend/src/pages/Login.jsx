import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, CheckCircle2, Mail } from 'lucide-react'
import useAuthStore from '../store/authStore'

const API_URL = import.meta.env.VITE_API_URL || '/api'
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verificationNeeded, setVerificationNeeded] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Show success message when redirected after email verification or password reset
  const justVerified = searchParams.get('verified') === 'true'
  const justReset = searchParams.get('reset') === 'true'
  const verifyError = searchParams.get('verify_error')

  const handleResendVerification = async () => {
    setResending(true)
    setResendMsg('')
    try {
      const response = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail })
      })
      const data = await response.json()
      if (response.ok) {
        setResendMsg(data.message || 'Verification email sent!')
      } else {
        setResendMsg(data.error || 'Failed to resend email')
      }
    } catch {
      setResendMsg('Network error. Please try again.')
    }
    setResending(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setVerificationNeeded(false)
    setLoading(true)

    const result = await login(email, password)
    if (result.success) {
      // Redirect to dashboard — role-based router shows the correct dashboard
      navigate('/dashboard')
    } else {
      // Check if the error is about email verification
      if (result.requiresVerification) {
        setVerificationNeeded(true)
        setVerificationEmail(result.email || email)
      }
      setError(result.error)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12 bg-surface-low">
      <div className="w-full max-w-[420px] animate-fade-in">
        {/* Card */}
        <div className="bg-surface-lowest rounded-2xl p-8 md:p-10" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/logo.png" alt="Sanjivani CareerSpace Logo" className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-semibold text-on-surface leading-tight">Sanjivani CareerSpace</h1>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Assessment Portal</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-on-surface mb-1">Sign in to your account</h2>
          <p className="text-sm text-on-surface-variant mb-8">Enter your credentials to access the portal.</p>

          {/* Email verified success banner */}
          {justVerified && (
            <div className="bg-[#dcfce7] rounded-lg px-4 py-3 mb-6 flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="text-[#166534] shrink-0" />
              <p className="text-sm text-[#166534] font-medium">Email verified successfully! You can now sign in.</p>
            </div>
          )}

          {/* Password reset success banner */}
          {justReset && (
            <div className="bg-[#dcfce7] rounded-lg px-4 py-3 mb-6 flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="text-[#166534] shrink-0" />
              <p className="text-sm text-[#166534] font-medium">Password reset successfully! Sign in with your new password.</p>
            </div>
          )}

          {/* Verification error banner */}
          {verifyError && (
            <div className="bg-[#fef3c7] rounded-lg px-4 py-3 mb-6 animate-fade-in">
              <p className="text-sm text-[#92400e] font-medium">
                {verifyError === 'expired' 
                  ? 'Your verification link has expired. Please request a new one below.'
                  : verifyError === 'missing_token'
                  ? 'Invalid verification link. Please request a new one.'
                  : 'Verification failed. Please try again or request a new link.'}
              </p>
            </div>
          )}

          {/* Verification needed banner */}
          {verificationNeeded && (
            <div className="bg-[#fef3c7] rounded-lg px-4 py-3 mb-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <Mail size={16} className="text-[#92400e] shrink-0" />
                <p className="text-sm text-[#92400e] font-medium">Email verification required</p>
              </div>
              <p className="text-xs text-[#92400e]/80 mb-3">
                Please check your inbox for the verification link before logging in.
              </p>
              {resendMsg && (
                <p className={`text-xs font-medium mb-2 ${resendMsg.includes('sent') ? 'text-[#166534]' : 'text-error'}`}>
                  {resendMsg}
                </p>
              )}
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="text-xs font-semibold text-[#92400e] hover:underline disabled:opacity-50"
              >
                {resending ? 'Sending...' : 'Resend verification email'}
              </button>
            </div>
          )}

          {error && !verificationNeeded && (
            <div className="bg-error-container rounded-lg px-4 py-3 mb-6 text-sm text-error font-medium animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">
                Email
              </label>
              <input
                type="email"
                className="input-minimal"
                placeholder="student@sanjivani.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-minimal pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded accent-primary" />
                <span className="text-xs text-on-surface-variant">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-xs font-medium text-primary no-underline hover:underline">
                Forgot password?
              </Link>
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
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-on-surface-variant text-center mt-8">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary font-medium no-underline hover:underline">
              Request Access
            </Link>
          </p>
        </div>

        <p className="text-[10px] text-on-surface-variant/60 text-center mt-6">
          © 2026 Sanjivani CareerSpace. Precision in Intelligence.
        </p>
      </div>
    </div>
  )
}
