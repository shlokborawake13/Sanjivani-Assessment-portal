import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000 // 30 second timeout (Render free tier cold-starts can be slow)
})

// ─── In-flight GET request deduplication ───
// If the same GET URL is requested while one is already pending, reuse the same promise
const pendingRequests = new Map()

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
      // Short delay before retry (500ms instead of 1000ms for faster recovery)
      await new Promise(resolve => setTimeout(resolve, 500))
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

// ─── Wrapper with GET deduplication ───
const originalGet = api.get.bind(api)
api.get = (url, config) => {
  const cacheKey = typeof url === 'string' ? url : url.toString()

  // If there's already an in-flight request for this URL, return the same promise
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)
  }

  const promise = originalGet(url, config)
    .finally(() => {
      pendingRequests.delete(cacheKey)
    })

  pendingRequests.set(cacheKey, promise)
  return promise
}

export default api
