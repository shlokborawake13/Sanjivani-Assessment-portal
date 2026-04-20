import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Upload, X, Camera, Eye, EyeOff, CheckCircle2, Mail } from 'lucide-react'
import useAuthStore from '../store/authStore'

const departments = [
  'AIDS',
  'AIML',
  'CSE',
  'CY',
  'BBA',
  'MBA',
  'B.COM',
  'I.B-Tech',
  'I.M-Tech',
  'BCA/MCA',
  'B. Pharm (SPS)',
  'BSC/MSC (SSC)',
]

const years = ['1st', '2nd', '3rd', '4th']
const divisions = ['A', 'B', 'C', 'D', 'E']

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', prn: '', phone: '',
    department: '', year: '', division: '',
    password: '', confirmPassword: ''
  })
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (errors[field]) setErrors({ ...errors, [field]: '' })
    if (serverError) setServerError('')
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate type
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors({ ...errors, photo: 'Only JPG, PNG, or WebP images are allowed' })
      return
    }
    // Validate size
    if (file.size > 2 * 1024 * 1024) {
      setErrors({ ...errors, photo: 'Image must be under 2MB' })
      return
    }

    setProfilePhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setErrors({ ...errors, photo: '' })
  }

  const removePhoto = () => {
    setProfilePhoto(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Full name is required (min 2 chars)'
    if (!form.prn.trim()) errs.prn = 'PRN is required'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'A valid email is required'
    if (!form.phone.trim() || !/^\d{10}$/.test(form.phone.trim())) errs.phone = 'A valid 10-digit phone number is required'
    if (!form.department) errs.department = 'Department is required'
    if (!form.year) errs.year = 'Year is required'
    if (!form.division) errs.division = 'Division is required'
    if (!form.password || form.password.length < 6) errs.password = 'Password must be at least 6 characters'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleResendVerification = async () => {
    setResending(true)
    setResendMsg('')
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail })
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
    if (!validate()) return

    setLoading(true)
    setServerError('')

    try {
      // Build FormData for multipart upload
      const formData = new FormData()
      formData.append('name', form.name.trim())
      formData.append('email', form.email.trim().toLowerCase())
      formData.append('prn', form.prn.trim())
      formData.append('phone', form.phone.trim())
      formData.append('department', form.department)
      formData.append('year', form.year)
      formData.append('division', form.division)
      formData.append('password', form.password)
      if (profilePhoto) {
        formData.append('profilePhoto', profilePhoto)
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        body: formData // No Content-Type header — browser sets it with boundary
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.errors) {
          setErrors(data.errors)
        }
        setServerError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      // Registration successful — show verification message
      if (data.requiresVerification) {
        setRegistrationSuccess(true)
        setRegisteredEmail(form.email.trim().toLowerCase())
        setLoading(false)
        return
      }

      // Fallback: if backend auto-confirmed (for existing users), log in directly
      if (data.user && data.session) {
        localStorage.setItem('sanjivani_user', JSON.stringify(data.user))
        localStorage.setItem('sanjivani_session', JSON.stringify(data.session))
        useAuthStore.setState({
          user: data.user,
          session: data.session,
          isAuthenticated: true,
          role: data.user.role,
          loading: false,
          error: null
        })
        navigate('/dashboard')
        return
      }

      // If requiresLogin, redirect to login
      if (data.requiresLogin) {
        navigate('/login')
        return
      }
    } catch (err) {
      console.error('Register error:', err)
      setServerError('Network error. Please try again.')
    }
    setLoading(false)
  }

  // ── Registration Success View ───────────────────────
  if (registrationSuccess) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12 bg-surface-low">
        <div className="w-full max-w-[480px] animate-fade-in">
          <div className="bg-surface-lowest rounded-2xl p-8 md:p-10 text-center" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
            {/* Success Icon */}
            <div className="w-20 h-20 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-6">
              <Mail size={36} className="text-[#166534]" />
            </div>

            <h2 className="text-xl font-bold text-on-surface mb-2">Check Your Email!</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              We've sent a verification link to <strong className="text-on-surface">{registeredEmail}</strong>. 
              Please click the link in the email to verify your account.
            </p>

            <div className="bg-surface-low rounded-xl p-4 mb-6 text-left">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">What to do next:</p>
              <ul className="text-xs text-on-surface-variant space-y-1.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={12} className="text-[#166534] mt-0.5 shrink-0" />
                  Open your email inbox
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={12} className="text-[#166534] mt-0.5 shrink-0" />
                  Click the "Verify Account" link in the email
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={12} className="text-[#166534] mt-0.5 shrink-0" />
                  You'll be redirected to the login page
                </li>
              </ul>
            </div>

            {resendMsg && (
              <p className={`text-xs font-medium mb-4 ${resendMsg.includes('sent') ? 'text-[#166534]' : 'text-error'}`}>
                {resendMsg}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="py-2.5 rounded-xl text-sm font-medium bg-surface-high text-on-surface-variant hover:bg-surface-highest transition-colors disabled:opacity-50"
              >
                {resending ? 'Sending...' : 'Resend Verification Email'}
              </button>
              <Link
                to="/login"
                className="btn-gradient py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 no-underline"
              >
                Go to Login
                <ArrowRight size={16} />
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

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12 bg-surface-low">
      <div className="w-full max-w-[580px] animate-fade-in">
        <div className="bg-surface-lowest rounded-2xl p-8 md:p-10" style={{ boxShadow: 'var(--shadow-ambient-lg)' }}>
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/logo.png" alt="Sanjivani CareerSpace Logo" className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-lg font-semibold text-on-surface leading-tight">Sanjivani CareerSpace</h1>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Assessment Portal</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-on-surface mb-1">Create your account</h2>
          <p className="text-sm text-on-surface-variant mb-8">Register to access assessments and track your progress.</p>

          {serverError && (
            <div className="bg-error-container rounded-lg px-4 py-3 mb-6 text-sm text-error font-medium animate-fade-in">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* ── Profile Photo ───────────────────── */}
            <div className="flex flex-col items-center mb-2">
              <div
                className="relative w-24 h-24 rounded-2xl bg-surface-high flex items-center justify-center overflow-hidden cursor-pointer group border-2 border-dashed border-outline/30 hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {photoPreview ? (
                  <>
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera size={20} className="text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-on-surface-variant">
                    <Upload size={20} />
                    <span className="text-[9px] font-medium uppercase tracking-wider">Upload</span>
                  </div>
                )}
              </div>
              {photoPreview && (
                <button type="button" onClick={removePhoto}
                  className="flex items-center gap-1 text-[10px] text-error font-medium mt-2 hover:underline">
                  <X size={12} /> Remove Photo
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
              <p className="text-[10px] text-on-surface-variant mt-1">JPG, PNG or WebP · Max 2 MB</p>
              {errors.photo && <p className="text-xs text-error mt-1">{errors.photo}</p>}
            </div>

            {/* ── Name & PRN ─────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Full Name *</label>
                <input type="text" className={`input-minimal ${errors.name ? 'border-b-error' : ''}`}
                  placeholder="Arjun Mehta" value={form.name} onChange={update('name')} />
                {errors.name && <p className="text-[11px] text-error mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">PRN *</label>
                <input type="text" className={`input-minimal ${errors.prn ? 'border-b-error' : ''}`}
                  placeholder="PRN2024001" value={form.prn} onChange={update('prn')} />
                {errors.prn && <p className="text-[11px] text-error mt-1">{errors.prn}</p>}
              </div>
            </div>

            {/* ── Email & Phone ───────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Email *</label>
                <input type="email" className={`input-minimal ${errors.email ? 'border-b-error' : ''}`}
                  placeholder="student@sanjivani.edu" value={form.email} onChange={update('email')} />
                {errors.email && <p className="text-[11px] text-error mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Phone Number *</label>
                <input type="tel" className={`input-minimal ${errors.phone ? 'border-b-error' : ''}`}
                  placeholder="9876543210" value={form.phone} onChange={update('phone')} maxLength={10} />
                {errors.phone && <p className="text-[11px] text-error mt-1">{errors.phone}</p>}
              </div>
            </div>

            {/* ── Department, Year, Division ──────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Department *</label>
                <select className={`input-minimal cursor-pointer ${errors.department ? 'border-b-error' : ''}`}
                  value={form.department} onChange={update('department')}>
                  <option value="">Select</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.department && <p className="text-[11px] text-error mt-1">{errors.department}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Year *</label>
                <select className={`input-minimal cursor-pointer ${errors.year ? 'border-b-error' : ''}`}
                  value={form.year} onChange={update('year')}>
                  <option value="">Select</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                {errors.year && <p className="text-[11px] text-error mt-1">{errors.year}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Division *</label>
                <select className={`input-minimal cursor-pointer ${errors.division ? 'border-b-error' : ''}`}
                  value={form.division} onChange={update('division')}>
                  <option value="">Select</option>
                  {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.division && <p className="text-[11px] text-error mt-1">{errors.division}</p>}
              </div>
            </div>

            {/* ── Password Fields ─────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Password *</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'}
                    className={`input-minimal pr-10 ${errors.password ? 'border-b-error' : ''}`}
                    placeholder="Min 6 characters" value={form.password} onChange={update('password')} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-on-surface transition-colors">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-[11px] text-error mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Confirm Password *</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'}
                    className={`input-minimal pr-10 ${errors.confirmPassword ? 'border-b-error' : ''}`}
                    placeholder="Re-enter password" value={form.confirmPassword} onChange={update('confirmPassword')} />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-on-surface transition-colors">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-[11px] text-error mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>

            {/* ── Submit ──────────────────────────── */}
            <button type="submit" disabled={loading}
              className="btn-gradient py-3 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 mt-2">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Create Account
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-on-surface-variant text-center mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-medium no-underline hover:underline">Sign In</Link>
          </p>
        </div>

        <p className="text-[10px] text-on-surface-variant/60 text-center mt-6">
          © 2026 Sanjivani CareerSpace. Precision in Intelligence.
        </p>
      </div>
    </div>
  )
}
