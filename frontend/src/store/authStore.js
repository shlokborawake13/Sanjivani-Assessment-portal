import { create } from 'zustand'
import api from '../services/api'

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('sanjivani_user') || 'null'),
  session: JSON.parse(localStorage.getItem('sanjivani_session') || 'null'),
  isAuthenticated: !!localStorage.getItem('sanjivani_session'),
  role: JSON.parse(localStorage.getItem('sanjivani_user') || 'null')?.role || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/login', { email, password })
      const { user, session } = data

      localStorage.setItem('sanjivani_user', JSON.stringify(user))
      localStorage.setItem('sanjivani_session', JSON.stringify(session))

      set({
        user,
        session,
        isAuthenticated: true,
        role: user.role,
        loading: false,
        error: null
      })
      
      // Record daily visit for streak
      get().checkin()

      return { success: true, role: user.role }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Login failed'
      const requiresVerification = err.response?.data?.requiresVerification || false
      const verificationEmail = err.response?.data?.email || ''
      set({ loading: false, error: errorMsg })
      return { 
        success: false, 
        error: errorMsg, 
        requiresVerification,
        email: verificationEmail
      }
    }
  },

  register: async (userData) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/register', {
        email: userData.email,
        password: userData.password,
        name: userData.name,
        prn: userData.prn,
        department: userData.department
      })

      // If verification is required, don't auto-login
      if (data.requiresVerification) {
        set({ loading: false, error: null })
        return { success: true, requiresVerification: true, message: data.message }
      }

      const { user, session } = data

      localStorage.setItem('sanjivani_user', JSON.stringify(user))
      localStorage.setItem('sanjivani_session', JSON.stringify(session))

      set({
        user,
        session,
        isAuthenticated: true,
        role: user.role,
        loading: false,
        error: null
      })

      return { success: true }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Registration failed'
      set({ loading: false, error: errorMsg })
      return { success: false, error: errorMsg }
    }
  },

  logout: () => {
    localStorage.removeItem('sanjivani_user')
    localStorage.removeItem('sanjivani_session')
    set({
      user: null,
      session: null,
      isAuthenticated: false,
      role: null,
      loading: false,
      error: null
    })
  },

  updateProfile: async (updates) => {
    try {
      const { data } = await api.put('/profile', updates)
      const updatedUser = data.user
      localStorage.setItem('sanjivani_user', JSON.stringify(updatedUser))
      set({ user: updatedUser })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Update failed' }
    }
  },

  refreshUser: async () => {
    try {
      const { data } = await api.get('/auth/me')
      const user = data.user
      if (user) {
        localStorage.setItem('sanjivani_user', JSON.stringify(user))
        set({ user, role: user.role })
      }
      // Record daily visit for streak
      get().checkin()
    } catch {
      // silently fail — don't log out on refresh failure
    }
  },

  checkin: async () => {
    try {
      const res = await api.post('/leaderboard/checkin')
      const { streak, max_streak } = res.data
      // Update user profile with latest streak data
      const currentUser = get().user
      if (currentUser && (streak !== undefined)) {
        const updatedUser = { ...currentUser, current_streak: streak, max_streak: max_streak }
        localStorage.setItem('sanjivani_user', JSON.stringify(updatedUser))
        set({ user: updatedUser })
      }
      return res.data
    } catch {
      // non-fatal
      return { streak: 0, max_streak: 0 }
    }
  },

  clearError: () => set({ error: null })
}))

export default useAuthStore
