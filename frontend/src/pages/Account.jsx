import { useState, useRef } from 'react'
import { Save, User, Mail, Hash, Building2, Phone, Calendar, Layers, Camera, Upload, X, CheckCircle2, Lock } from 'lucide-react'
import useAuthStore from '../store/authStore'

const departments = [
  'AIDS', 'AIML', 'CSE', 'CY', 'BBA', 'MBA',
  'B.COM', 'I.B-Tech', 'I.M-Tech', 'BCA/MCA',
  'B. Pharm (SPS)', 'BSC/MSC (SSC)',
]
const years = ['1st', '2nd', '3rd', '4th']
const divisions = ['A', 'B', 'C', 'D', 'E']

export default function Account() {
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState({
    department: user?.department || '',
    year: user?.year || '',
    division: user?.division || '',
  })
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(user?.profile_url || null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (saved) setSaved(false)
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPG, PNG, or WebP images are allowed')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB')
      return
    }
    setProfilePhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      // Only send editable fields
      formData.append('department', form.department)
      formData.append('year', form.year)
      formData.append('division', form.division)
      if (profilePhoto) formData.append('profilePhoto', profilePhoto)

      const sessionStr = localStorage.getItem('sanjivani_session')
      const session = sessionStr ? JSON.parse(sessionStr) : null

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Update failed')
        setLoading(false)
        return
      }

      // Update store
      localStorage.setItem('sanjivani_user', JSON.stringify(data.user))
      useAuthStore.setState({ user: data.user })

      if (data.user.profile_url) {
        setPhotoPreview(data.user.profile_url)
      }
      setProfilePhoto(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  const profileInitial = user?.name?.charAt(0) || 'U'

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Settings</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Account Center</h1>
        <p className="text-sm text-on-surface-variant mt-1">Manage your profile information and preferences.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* ── Profile Card ─────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-surface-lowest rounded-xl p-6 text-center" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            {/* Avatar */}
            <div className="relative w-24 h-24 mx-auto mb-4 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" className="w-24 h-24 rounded-2xl object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-2xl btn-gradient flex items-center justify-center text-2xl font-bold text-on-primary">
                  {profileInitial}
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={20} className="text-white" />
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
            </div>

            <h2 className="text-lg font-semibold text-on-surface mb-0.5">{user?.name}</h2>
            <p className="text-xs text-on-surface-variant mb-1">{user?.department} — {user?.year} Year, Div {user?.division}</p>
            <p className="text-[10px] text-accent font-semibold uppercase tracking-wider mb-4">{user?.role}</p>

            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-center gap-3 px-4 py-3 bg-surface-low rounded-lg">
                <Mail size={14} className="text-on-surface-variant shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Email</p>
                  <p className="text-xs font-medium text-on-surface truncate">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-surface-low rounded-lg">
                <Hash size={14} className="text-on-surface-variant shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">PRN</p>
                  <p className="text-xs font-medium text-on-surface">{user?.prn || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-surface-low rounded-lg">
                <Phone size={14} className="text-on-surface-variant shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Phone</p>
                  <p className="text-xs font-medium text-on-surface">{user?.phone || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-surface-low rounded-lg">
                <Building2 size={14} className="text-on-surface-variant shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Department</p>
                  <p className="text-xs font-medium text-on-surface">{user?.department || 'Not set'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Edit Form ────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="bg-surface-lowest rounded-xl p-6 md:p-8" style={{ boxShadow: 'var(--shadow-ambient)' }}>
            <h3 className="text-base font-semibold text-on-surface mb-6">Edit Profile</h3>

            {saved && (
              <div className="flex items-center gap-2 bg-[#dcfce7] rounded-lg px-4 py-3 mb-6 animate-fade-in">
                <CheckCircle2 size={16} className="text-[#166534]" />
                <p className="text-sm text-[#166534] font-medium">Profile updated successfully.</p>
              </div>
            )}
            {error && (
              <div className="bg-error-container rounded-lg px-4 py-3 mb-6 text-sm text-error font-medium animate-fade-in">
                {error}
              </div>
            )}

            {/* Locked Fields Notice */}
            <div className="flex items-center gap-2 bg-surface-low rounded-lg px-4 py-3 mb-6">
              <Lock size={14} className="text-on-surface-variant shrink-0" />
              <p className="text-xs text-on-surface-variant">
                <strong className="text-on-surface">Name, Email, PRN, and Phone</strong> are locked after registration and cannot be changed. Contact admin for corrections.
              </p>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-6">
              {/* Locked Fields — Read-only */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    Full Name <Lock size={10} className="text-outline" />
                  </label>
                  <input type="text" className="input-minimal opacity-60 cursor-not-allowed" value={user?.name || ''} disabled />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    Email <Lock size={10} className="text-outline" />
                  </label>
                  <input type="email" className="input-minimal opacity-60 cursor-not-allowed" value={user?.email || ''} disabled />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    PRN <Lock size={10} className="text-outline" />
                  </label>
                  <input type="text" className="input-minimal opacity-60 cursor-not-allowed" value={user?.prn || ''} disabled />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    Phone <Lock size={10} className="text-outline" />
                  </label>
                  <input type="tel" className="input-minimal opacity-60 cursor-not-allowed" value={user?.phone || ''} disabled />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-outline-variant/30 pt-2">
                <p className="text-xs font-medium text-accent uppercase tracking-wider mb-4">Editable Fields</p>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Department</label>
                  <select className="input-minimal cursor-pointer" value={form.department} onChange={update('department')}>
                    <option value="">Select</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Year</label>
                  <select className="input-minimal cursor-pointer" value={form.year} onChange={update('year')}>
                    <option value="">Select</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block">Division</label>
                  <select className="input-minimal cursor-pointer" value={form.division} onChange={update('division')}>
                    <option value="">Select</option>
                    {divisions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={loading}
                  className="btn-gradient px-6 py-2.5 rounded-[10px] text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Save size={14} /> Save Changes</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
