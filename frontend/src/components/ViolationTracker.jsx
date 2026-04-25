import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, EyeOff } from 'lucide-react'
import api from '../services/api'

/**
 * ViolationTracker — Centralized violation detection and reporting.
 * 
 * Supports TWO usage patterns:
 * 1. Render Props: <ViolationTracker>{({ logViolation }) => ... }</ViolationTracker>
 * 2. Component:    <ViolationTracker onViolation={fn}><Child/></ViolationTracker>
 * 
 * Monitors:
 * - Tab switching (visibilitychange)
 * - Window blur (alt-tab, other windows)
 * - Reports ALL events to the server for backend enforcement
 * 
 * Backend is the source of truth for violation counts and auto-submit.
 */
export default function ViolationTracker({
  enabled = true,
  attemptId,
  maxWarnings = 3,
  onAutoSubmit,
  onViolation,
  showWarning = true,
  children,
}) {
  const [warningCount, setWarningCount] = useState(0)
  const [showBanner, setShowBanner] = useState(false)
  const [lastViolation, setLastViolation] = useState(null)
  const cooldownRef = useRef(false)

  const logViolation = useCallback(async (type, details) => {
    if (!enabled || cooldownRef.current) return

    // Cooldown to prevent spam
    cooldownRef.current = true
    setTimeout(() => { cooldownRef.current = false }, 2000)

    setWarningCount(prev => prev + 1)
    setLastViolation({ type, details, time: new Date() })
    if (showWarning) setShowBanner(true)

    // Report to parent
    onViolation?.(type, details)

    // Report to backend
    if (attemptId) {
      try {
        await api.post(`/proctoring/${attemptId}/face-event`, {
          event_type: type,
          details: details,
        })
      } catch (err) {
        // Non-fatal — also try legacy endpoint
        try {
          await api.post(`/attempts/${attemptId}/violation`, {
            type, details,
          })
        } catch (e) {
          // Ignore
        }
      }
    }

    // Auto-dismiss banner after 3 seconds
    setTimeout(() => setShowBanner(false), 3000)
  }, [enabled, attemptId, onViolation, showWarning])

  useEffect(() => {
    if (!enabled) return

    function handleVisibilityChange() {
      if (document.hidden) {
        logViolation('tab_switch', 'Tab focus lost (visibilitychange)')
      }
    }

    function handleBlur() {
      logViolation('window_blur', 'Window lost focus (blur event)')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [enabled, logViolation])

  // Check against threshold
  useEffect(() => {
    if (warningCount >= maxWarnings && warningCount > 0) {
      onAutoSubmit?.(`Tab switch/blur violations exceeded (${warningCount}/${maxWarnings})`)
    }
  }, [warningCount, maxWarnings, onAutoSubmit])

  // Determine render mode: render-props or regular children
  const isRenderProps = typeof children === 'function'

  return (
    <>
      {/* Warning banner */}
      {enabled && showWarning && showBanner && (
        <div className="fixed top-0 left-0 right-0 z-[9990] animate-slide-down">
          <div className="bg-gradient-to-r from-red-600/95 to-orange-600/95 backdrop-blur-sm px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle size={16} className="text-white" />
              <span className="text-white text-sm font-semibold">
                ⚠️ Warning {warningCount}/{maxWarnings}: {lastViolation?.details || 'Violation detected'}
              </span>
            </div>
            <p className="text-white/70 text-xs mt-1">
              {warningCount >= maxWarnings - 1
                ? 'Next violation will auto-submit your exam!'
                : 'Your activity is being monitored. Do not switch tabs.'}
            </p>
          </div>
        </div>
      )}

      {/* Persistent violation counter */}
      {enabled && warningCount > 0 && (
        <div className="fixed bottom-4 right-4 z-[9990]">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
            warningCount >= maxWarnings - 1
              ? 'bg-red-500/20 border border-red-500/30 text-red-400'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            <EyeOff size={12} />
            <span>{warningCount}/{maxWarnings} violations</span>
          </div>
        </div>
      )}

      {/* Render children — support both patterns */}
      {isRenderProps ? children({ logViolation }) : children}
    </>
  )
}
