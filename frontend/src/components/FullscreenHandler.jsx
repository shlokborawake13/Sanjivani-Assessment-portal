import { useEffect, useCallback, useRef } from 'react'

/**
 * FullscreenHandler — Enters fullscreen on mount, detects exits,
 * warns on first exit, triggers auto-submit on second.
 */
export default function FullscreenHandler({ enabled = true, onViolation, onAutoSubmit }) {
  const exitCount = useRef(0)
  const isFullscreen = useRef(false)

  const enterFullscreen = useCallback(async () => {
    if (!enabled) return
    try {
      const el = document.documentElement
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      else if (el.msRequestFullscreen) await el.msRequestFullscreen()
      isFullscreen.current = true
    } catch (err) {
      console.warn('Fullscreen request failed:', err)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    enterFullscreen()

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      )

      if (!isCurrentlyFullscreen && isFullscreen.current) {
        exitCount.current += 1
        isFullscreen.current = false

        if (exitCount.current >= 2) {
          if (onAutoSubmit) onAutoSubmit('Fullscreen exit violation')
        } else {
          if (onViolation) onViolation('fullscreen_exit', 'Exited fullscreen mode')
          // Try to re-enter fullscreen
          setTimeout(() => enterFullscreen(), 500)
        }
      } else if (isCurrentlyFullscreen) {
        isFullscreen.current = true
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      // Exit fullscreen on unmount
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [enabled, onViolation, onAutoSubmit, enterFullscreen])

  return null // Render nothing — logic only
}
