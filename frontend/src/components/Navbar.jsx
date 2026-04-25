import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, LogOut, User, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import useAuthStore from '../store/authStore'

/* ── Nav configs per role ── */
const publicLinks = [
  { label: 'Home', path: '/' },
  { label: 'About', path: '/#about' },
  { label: 'Assessments', path: '/#assessments' },
  { label: 'Contact', path: '/support' },
]

const studentLinks = [
  { label: 'Home', path: '/dashboard' },
  { label: 'Assessments', path: '/assessments' },
  { label: 'Results', path: '/results' },
  { label: 'Leaderboard', path: '/leaderboard' },
]

const adminLinks = [
  { label: 'Home', path: '/dashboard' },
  { label: 'Users', path: '/users' },
  { label: 'Assessments', path: '/assessments' },
  { label: 'Attempts', path: '/admin/attempts' },
  { label: 'Announcements', path: '/announcements' },
  { label: 'Leaderboard', path: '/leaderboard' },
  { label: 'Support', path: '/admin/support' },
]

const managerLinks = [
  { label: 'Home', path: '/dashboard' },
  { label: 'Assessments', path: '/assessments' },
  { label: 'Results', path: '/results' },
  { label: 'Reports', path: '/reports' },
]

function getNavLinks(isAuthenticated, role) {
  if (!isAuthenticated) return publicLinks
  if (role === 'admin') return adminLinks
  if (role === 'manager') return managerLinks
  return studentLinks
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.role)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const avatarRef = useRef(null)

  const navLinks = getNavLinks(isAuthenticated, role)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
    setAvatarOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    setAvatarOpen(false)
    navigate('/login')
  }

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <header 
      className={`fixed top-0 w-full z-50 transition-all duration-300 ease-in-out flex justify-center ${
        isScrolled ? 'pt-4 px-4 pointer-events-none' : 'pt-0 px-0 pointer-events-auto'
      }`}
    >
      <div 
        className={`glass w-full border-none transition-all duration-300 ease-in-out relative ${
          isScrolled 
            ? 'pointer-events-auto max-w-[1050px] rounded-full shadow-lg border border-outline/20' 
            : 'max-w-full rounded-none'
        }`}
        style={!isScrolled ? { borderBottom: '1px solid rgba(197, 197, 211, 0.2)' } : {}}
      >
        <div className={`mx-auto h-16 flex items-center justify-between transition-all duration-300 ${
          isScrolled ? 'px-6 md:px-8' : 'px-6 max-w-[1200px]'
        }`}>
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline group">
            <img src="/logo.png" alt="Sanjivani CareerSpace Logo" className="h-9 w-auto object-contain" />
            <span className="text-lg font-semibold text-primary tracking-tight">
              Sanjivani CareerSpace
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium no-underline transition-colors duration-200 ${
                  isActive(link.path)
                    ? 'text-primary'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Auth Area (Desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              /* ── Avatar Dropdown ── */
              <div className="relative" ref={avatarRef}>
                <button
                  onClick={() => setAvatarOpen(!avatarOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-full hover:bg-surface-high transition-colors duration-200"
                >
                  <div className="w-8 h-8 rounded-full btn-gradient flex items-center justify-center text-xs font-bold text-on-primary">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium text-on-surface max-w-[120px] truncate">
                    {user?.name || 'User'}
                  </span>
                  <ChevronDown size={14} className={`text-on-surface-variant transition-transform duration-200 ${avatarOpen ? 'rotate-180' : ''}`} />
                </button>

                {avatarOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-[220px] bg-surface-lowest rounded-2xl overflow-hidden animate-fade-in z-50"
                    style={{ boxShadow: 'var(--shadow-ambient-lg)', border: '1px solid rgba(197,197,211,0.15)' }}
                  >
                    {/* User info */}
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(197,197,211,0.15)' }}>
                      <p className="text-sm font-medium text-on-surface truncate">{user?.name}</p>
                      <p className="text-[10px] text-on-surface-variant capitalize">{role}</p>
                    </div>
                    {/* Links */}
                    <div className="py-1">
                      <Link
                        to="/profile"
                        onClick={() => setAvatarOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-high hover:text-on-surface no-underline transition-colors"
                      >
                        <User size={16} />
                        Profile & Account
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error-container transition-colors w-full"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-5 py-2 rounded-[10px] text-sm font-medium text-primary no-underline border border-outline/30 hover:bg-surface-high transition-colors duration-200"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="btn-accent px-5 py-2 rounded-[10px] text-sm font-medium no-underline"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 text-on-surface-variant"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div 
            className={`absolute left-0 right-0 md:hidden glass animate-fade-in ${
              isScrolled 
                ? 'top-full mt-2 rounded-[24px] shadow-lg border border-outline/20 pointer-events-auto' 
                : 'top-full mt-0 border-b border-outline/20 pointer-events-auto'
            }`} 
            style={!isScrolled ? { borderTop: '1px solid rgba(197, 197, 211, 0.2)' } : {}}
          >
            <nav className="flex flex-col px-6 py-4 gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileOpen(false)}
                  className={`py-2.5 text-sm font-medium no-underline transition-colors ${
                    isActive(link.path) ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(197, 197, 211, 0.2)' }}>
                {isAuthenticated ? (
                  <>
                    {/* User info in mobile */}
                    <div className="flex items-center gap-3 px-1 py-2">
                      <div className="w-8 h-8 rounded-full btn-gradient flex items-center justify-center text-xs font-bold text-on-primary">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface leading-tight">{user?.name}</p>
                        <p className="text-[10px] text-on-surface-variant capitalize">{role}</p>
                      </div>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="py-2.5 text-sm font-medium text-on-surface-variant hover:text-primary no-underline transition-colors"
                    >
                      Profile & Account
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="py-2.5 text-sm font-medium text-error text-left hover:text-error transition-colors"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setMobileOpen(false)} className="px-5 py-2.5 rounded-[10px] text-sm font-medium text-primary no-underline border border-outline/30 text-center">
                      Sign In
                    </Link>
                    <Link to="/register" onClick={() => setMobileOpen(false)} className="btn-accent px-5 py-2.5 rounded-[10px] text-sm font-medium no-underline text-center">
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
