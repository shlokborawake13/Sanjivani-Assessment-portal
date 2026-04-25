import { useEffect, useRef } from 'react'
import api from '../services/api'

/**
 * ProctoringHeartbeat — Client-to-server heartbeat.
 * 
 * Sends proctoring status to the backend every 5 seconds.
 * The server uses this to:
 * 1. Verify the student is still active
 * 2. Validate proctoring state (camera, face, audio, fullscreen)
 * 3. Auto-submit if heartbeat stops (student closed tab/crashed)
 * 
 * This is the REAL enforcement mechanism — all other client-side
 * checks are just UI. The server validates everything.
 */
export default function ProctoringHeartbeat({
  attemptId,
  enabled = true,
  interval = 5000,
  // State refs updated by other components
  cameraActive = false,
  micActive = false,
  fullscreenActive = true,
  faceDetected = true,
  faceCount = 1,
  audioLevel = 0,
  onAutoSubmit,
}) {
  const intervalRef = useRef(null)
  const sessionStartedRef = useRef(false)

  // Start proctoring session on mount
  useEffect(() => {
    if (!enabled || !attemptId || sessionStartedRef.current) return

    async function startSession() {
      try {
        const res = await api.post('/proctoring/start', {
          attempt_id: attemptId,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          user_agent: navigator.userAgent,
        })

        if (res.data.blocked) {
          // Screen size rejected by server
          onAutoSubmit?.('Screen resolution rejected by server')
          return
        }

        sessionStartedRef.current = true
        console.log('[Heartbeat] Proctoring session started:', res.data.session_id)
      } catch (err) {
        console.error('[Heartbeat] Failed to start proctoring session:', err)
        // Non-fatal — heartbeats will still work
      }
    }

    startSession()
  }, [enabled, attemptId])

  // Send heartbeats
  useEffect(() => {
    if (!enabled || !attemptId) return

    async function sendHeartbeat() {
      try {
        const res = await api.post(`/proctoring/${attemptId}/heartbeat`, {
          camera_active: cameraActive,
          mic_active: micActive,
          fullscreen_active: fullscreenActive,
          face_detected: faceDetected,
          face_count: faceCount,
          audio_level: audioLevel,
          screen_width: window.innerWidth,
          screen_height: window.innerHeight,
        })

        // Server may trigger auto-submit
        if (res.data.status === 'auto_submitted') {
          console.warn('[Heartbeat] Server triggered auto-submit:', res.data.auto_submit_reason)
          onAutoSubmit?.(res.data.auto_submit_reason || 'Server-side violation threshold exceeded')
        }
      } catch (err) {
        // Use sendBeacon as fallback
        try {
          const payload = JSON.stringify({
            camera_active: cameraActive,
            fullscreen_active: fullscreenActive,
            face_detected: faceDetected,
            face_count: faceCount,
          })
          navigator.sendBeacon?.(
            `${api.defaults.baseURL}/proctoring/${attemptId}/heartbeat`,
            new Blob([payload], { type: 'application/json' })
          )
        } catch {}
      }
    }

    // Initial heartbeat
    sendHeartbeat()

    // Recurring heartbeat
    intervalRef.current = setInterval(sendHeartbeat, interval)

    // Send on page unload
    function handleUnload() {
      const payload = JSON.stringify({
        camera_active: false,
        fullscreen_active: false,
        face_detected: false,
      })
      navigator.sendBeacon?.(
        `${api.defaults.baseURL}/proctoring/${attemptId}/heartbeat`,
        new Blob([payload], { type: 'application/json' })
      )
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(intervalRef.current)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [enabled, attemptId, interval, cameraActive, micActive, fullscreenActive, faceDetected, faceCount, audioLevel])

  return null // Invisible component
}
