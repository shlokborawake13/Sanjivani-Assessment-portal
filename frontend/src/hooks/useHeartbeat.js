import { useEffect, useRef } from 'react'
import api from '../services/api'
import useAuthStore from '../store/authStore'

/**
 * Sends a heartbeat to the server every 30 seconds while the user is logged in.
 * This powers the real-time "active users" display on admin/manager dashboards.
 */
export default function useHeartbeat() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    // Send immediately on mount
    const sendHeartbeat = () => {
      api.post('/activity/heartbeat').catch(() => {})
    }

    sendHeartbeat()

    // Then every 30 seconds
    intervalRef.current = setInterval(sendHeartbeat, 30 * 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAuthenticated])
}
