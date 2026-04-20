import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000 // 15 second timeout
})

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const sessionStr = localStorage.getItem('sanjivani_session')
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr)
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
      }
    } catch {}
  }
  return config
})

// Retry logic for failed requests (handles cold-start / proxy warmup)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    // Don't retry if already retried, or if it's a 4xx client error (except 408 timeout)
    const status = error.response?.status
    const isServerError = !status || status >= 500 || status === 408
    const isNetworkError = error.code === 'ECONNABORTED' || error.message?.includes('Network Error')

    if (!config._retried && (isServerError || isNetworkError)) {
      config._retried = true
      // Wait a short moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000))
      return api(config)
    }

    // Handle 401 responses (expired token)
    if (status === 401) {
      localStorage.removeItem('sanjivani_session')
      localStorage.removeItem('sanjivani_user')
      // Only redirect if not already on login/register
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

export default api
