import { useState, useCallback, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import api from '../services/api'

/**
 * ViolationTracker — Central state manager for all violations.
 * Shows warning modals, tracks counts, triggers auto-submit.
 */
export default function ViolationTracker({ attemptId, onAutoSubmit, children }) {
  const [warning, setWarning] = useState(null)
  const [violations, setViolations] = useState([])
  const violationCounts = useRef({})
  const autoSubmitted = useRef(false)

  const logViolation = useCallback(async (type, details) => {
    if (autoSubmitted.current) return

    // Track per-type count
    violationCounts.current[type] = (violationCounts.current[type] || 0) + 1
    const count = violationCounts.current[type]

    const violation = { type, details, timestamp: new Date().toISOString(), count }
    setViolations(prev => [...prev, violation])

    // Log to backend
    if (attemptId) {
      try {
        await api.post(`/attempts/${attemptId}/violation`, { type, details })
      } catch (err) {
        console.error('Failed to log violation:', err)
      }
    }

    // Determine warning message
    const warningMessages = {
      tab_switch: 'Tab switching detected. This is your final warning.',
      fullscreen_exit: 'Full screen mode is required. Please stay in fullscreen.',
      paste_attempt: 'Pasting is not allowed in this assessment.',
      copy_attempt: 'Copying is not allowed during the assessment.',
      face_detection: 'Please look at the screen to continue.',
      devtools: 'Developer tools detected. This is a violation.',
      right_click: 'Right-click is disabled during assessments.',
    }

    // Show warning on first violation of this type
    if (count === 1) {
      setWarning({
        type,
        message: warningMessages[type] || `Violation detected: ${type}`,
        severity: 'warning'
      })
      setTimeout(() => setWarning(null), 4000)
    }

    // Auto-submit on second violation for critical types
    const criticalTypes = ['tab_switch', 'fullscreen_exit', 'face_detection', 'paste_attempt']
    if (count >= 2 && criticalTypes.includes(type) && !autoSubmitted.current) {
      autoSubmitted.current = true
      const reasons = {
        tab_switch: 'Tab switching violation',
        fullscreen_exit: 'Fullscreen exit violation',
        face_detection: 'Face not detected',
        paste_attempt: 'Paste attempt detected'
      }
      if (onAutoSubmit) onAutoSubmit(reasons[type] || `${type} violation`)
    }
  }, [attemptId, onAutoSubmit])

  const dismissWarning = useCallback(() => setWarning(null), [])

  return (
    <>
      {/* Warning Banner */}
      {warning && (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pt-4 px-4 animate-fade-in">
          <div className="flex items-center gap-3 bg-[#fef2f2] border border-[#fca5a5] rounded-xl px-5 py-3 shadow-lg max-w-lg">
            <AlertTriangle size={18} className="text-error shrink-0" />
            <p className="text-sm font-medium text-error flex-1">{warning.message}</p>
            <button onClick={dismissWarning} className="p-1 hover:bg-error/10 rounded-lg transition-colors">
              <X size={14} className="text-error" />
            </button>
          </div>
        </div>
      )}

      {/* Pass logViolation to children via render prop */}
      {typeof children === 'function' ? children({ logViolation, violations }) : children}
    </>
  )
}
