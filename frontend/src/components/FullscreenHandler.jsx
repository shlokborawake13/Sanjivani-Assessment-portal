import { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize, AlertTriangle } from 'lucide-react'

/**
 * FullscreenHandler — Enforces fullscreen mode during proctored exams.
 * 
 * - Forces fullscreen on mount
 * - Tracks exits with configurable threshold
 * - Reports to violation handler + proctoring heartbeat
 * - Grace period on initial load (for permission dialogs)
 * - Re-entry prompt with countdown
 */
export default function FullscreenHandler({
  enabled = true,
  onViolation,
  onFullscreenChange,
  onAutoSubmit,
  maxExits = 3,
  gracePeriodMs = 5000,
  children,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exitCount, setExitCount] = useState(0)
  const [showPrompt, setShowPrompt] = useState(false)
  const graceRef = useRef(true)
  const mountTimeRef = useRef(Date.now())

  // Enter fullscreen
  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      else if (el.msRequestFullscreen) await el.msRequestFullscreen()
      setIsFullscreen(true)
      setShowPrompt(false)
      onFullscreenChange?.(true)
    } catch (err) {
      console.error('Fullscreen request failed:', err)
    }
  }, [onFullscreenChange])

  // Monitor fullscreen changes
  useEffect(() => {
    if (!enabled) return

    // Grace period — don't count exits immediately
    const graceTimer = setTimeout(() => {
      graceRef.current = false
    }, gracePeriodMs)

    function handleFullscreenChange() {
      const fsActive = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      )
      setIsFullscreen(fsActive)
      onFullscreenChange?.(fsActive)

      if (!fsActive && !graceRef.current) {
        // User exited fullscreen
        const newCount = exitCount + 1
        setExitCount(newCount)
        setShowPrompt(true)

        onViolation?.('fullscreen_exit', `Fullscreen exited (${newCount}/${maxExits})`)

        if (newCount >= maxExits) {
          onViolation?.('fullscreen_exceeded', `Fullscreen exit limit reached (${newCount}/${maxExits})`)
          onAutoSubmit?.(`Fullscreen exit limit exceeded (${newCount}/${maxExits})`)
        }
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    // Request fullscreen on mount
    enterFullscreen()

    return () => {
      clearTimeout(graceTimer)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [enabled, exitCount, maxExits])

  return (
    <>
      {children}

      {/* Re-entry prompt */}
      {showPrompt && enabled && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-amber-500/30 rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Maximize size={28} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Fullscreen Required</h2>
            <p className="text-gray-400 text-sm mb-2">
              You exited fullscreen mode. This has been logged as a violation.
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-amber-400 text-sm font-semibold">
                Warning {exitCount}/{maxExits}
              </span>
            </div>
            {exitCount >= maxExits ? (
              <p className="text-red-400 text-sm font-semibold">
                Maximum exits reached — your exam will be auto-submitted.
              </p>
            ) : (
              <button
                onClick={enterFullscreen}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold transition-colors"
              >
                Return to Fullscreen
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
