import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft, ShieldCheck } from 'lucide-react'
import api from '../services/api'

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [tokenData, setTokenData] = useState(null) // { type: 'hash'|'access', value: string }
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Extract token from URL — supports multiple formats
  useEffect(() => {
    // Priority 1: ?token=xxx (hashed_token from our direct link — new approach)
    const tokenFromQuery = searchParams.get('token')
    const typeFromQuery = searchParams.get('type')
    if (tokenFromQuery && typeFromQuery === 'recovery') {
      setTokenData({ type: 'hash', value: tokenFromQuery })
      return
    }

    // Priority 2: #access_token=xxx&type=recovery (Supabase redirect — legacy)
    const hash = window.location.hash
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const hashType = hashParams.get('type')
      if (accessToken && hashType === 'recovery') {
        setTokenData({ type: 'access', value: accessToken })
        // Clean up the URL hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        return
      }
    }

    // Priority 3: ?access_token=xxx (query param fallback)
    const accessFromQuery = searchParams.get('access_token')
    if (accessFromQuery) {
      setTokenData({ type: 'access', value: accessFromQuery })
      return
    }
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!tokenData) {
      setError('Invalid or expired reset link. Please request a new password reset.')
      return
    }

    setLoading(true)
    try {
      // Send the appropriate token field based on how we received it
      const payload = { new_password: newPassword }
      if (tokenData.type === 'hash') {
        payload.token_hash = tokenData.value
      } else {
        payload.access_token = tokenData.value
      }

      await api.post('/auth/reset-password', payload)
      setSuccess(true)
      // Auto-redirect to login after 3 seconds
      setTimeout(() => navigate('/login?reset=true'), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.')
    }
    setLoading(false)
  }

  // Password strength indicator
  const getStrength = (pw) => {
    if (!pw) return { level: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 6) score++
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    
    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' }
    if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-orange-500' }
    if (score <= 3) return { level: 3, label: 'Good', color: 'bg-yellow-500' }
    if (score <= 4) return { level: 4, label: 'Strong', color: 'bg-green-500' }
    return { level: 5, label: 'Very Strong', color: 'bg-emerald-500' }
  }

  const strength = getStrength(newPassword)

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

          {success ? (
            /* Success State */
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} className="text-[#166534]" />
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-2">Password Reset!</h2>
              <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                Your password has been updated successfully. You'll be redirected to the login page in a moment.
              </p>
              <div className="w-full bg-surface-low rounded-full h-1.5 mb-6">
                <div className="bg-primary h-1.5 rounded-full animate-pulse" style={{ width: '100%', animation: 'shrink 3s linear forwards' }} />
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium no-underline hover:underline"
              >
                Go to Login Now
              </Link>
            </div>
          ) : !tokenData ? (
            /* No Token State */
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mx-auto mb-6">
                <KeyRound size={32} className="text-error" />
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-2">Invalid Reset Link</h2>
              <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                className="btn-gradient px-6 py-2.5 rounded-[10px] text-sm font-semibold inline-flex items-center gap-2 no-underline"
              >
                Request New Link
              </Link>
            </div>
          ) : (
            /* Form State */
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center">
                  <ShieldCheck size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">Set new password</h2>
                  <p className="text-xs text-on-surface-variant">Choose a strong password for your account</p>
                </div>
              </div>

              {error && (
                <div className="bg-error-container rounded-lg px-4 py-3 mb-6 text-sm text-error font-medium animate-fade-in">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* New Password */}
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input-minimal pr-10"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Strength meter */}
                  {newPassword && (
                    <div className="mt-2 animate-fade-in">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= strength.level ? strength.color : 'bg-surface-high'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-on-surface-variant">{strength.label}</p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-minimal"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-error mt-1 animate-fade-in">Passwords do not match</p>
                  )}
                  {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
                    <p className="text-xs text-[#166534] mt-1 flex items-center gap-1 animate-fade-in">
                      <CheckCircle2 size={12} /> Passwords match
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || newPassword !== confirmPassword || newPassword.length < 6}
                  className="btn-gradient py-3 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 mt-1"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <KeyRound size={16} />
                      Reset Password
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
