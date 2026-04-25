import { useEffect, useRef } from 'react'

/**
 * DebuggerTrap — Enhanced DevTools detection.
 * 
 * Uses multiple heuristics to detect if DevTools are open:
 * 1. `debugger` statement timing (pauses when DevTools console is open)
 * 2. Window dimension difference (outerWidth - innerWidth)
 * 3. `performance.now()` timing check
 * 4. Blocks common DevTools keyboard shortcuts
 * 
 * All detections are reported to the violation handler + backend.
 * These are DETERRENTS — backend enforcement is what truly prevents cheating.
 */
export default function DebuggerTrap({ enabled = true, onViolation, attemptId }) {
  const detectedRef = useRef(false)
  const checkIntervalRef = useRef(null)
  const debuggerIntervalRef = useRef(null)

  useEffect(() => {
    if (!enabled) return

    // ── Method 1: Debugger statement timing ──
    // When DevTools console is open, debugger statement causes a pause
    // that is detectable via timing
    debuggerIntervalRef.current = setInterval(() => {
      const start = performance.now()
      // eslint-disable-next-line no-debugger
      debugger
      const elapsed = performance.now() - start
      // If it took > 100ms, DevTools was likely open
      if (elapsed > 100 && !detectedRef.current) {
        detectedRef.current = true
        reportDetection('debugger_trap', `Debugger pause detected: ${Math.round(elapsed)}ms`)
        // Reset after cooldown
        setTimeout(() => { detectedRef.current = false }, 10000)
      }
    }, 5000) // Check every 5 seconds

    // ── Method 2: Window dimension heuristic ──
    checkIntervalRef.current = setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth
      const heightDiff = window.outerHeight - window.innerHeight
      // When DevTools is docked, dimensions differ significantly
      if (widthDiff > 200 || heightDiff > 200) {
        if (!detectedRef.current) {
          detectedRef.current = true
          reportDetection('devtools_dimension', `Window size anomaly: w=${widthDiff}, h=${heightDiff}`)
          setTimeout(() => { detectedRef.current = false }, 10000)
        }
      }
    }, 3000)

    // ── Method 3: Keyboard shortcut blocking ──
    function handleKeyDown(e) {
      // F12
      if (e.key === 'F12') {
        e.preventDefault()
        reportDetection('keyboard_devtools', 'F12 pressed')
        return
      }
      // Ctrl+Shift+I (DevTools)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault()
        reportDetection('keyboard_devtools', 'Ctrl+Shift+I pressed')
        return
      }
      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault()
        reportDetection('keyboard_devtools', 'Ctrl+Shift+J pressed')
        return
      }
      // Ctrl+Shift+C (Element selector)
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        reportDetection('keyboard_devtools', 'Ctrl+Shift+C pressed')
        return
      }
      // Ctrl+U (View source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault()
        reportDetection('keyboard_source', 'Ctrl+U pressed')
        return
      }
      // Ctrl+P (Print)
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        return
      }
      // Ctrl+S (Save)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      clearInterval(debuggerIntervalRef.current)
      clearInterval(checkIntervalRef.current)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [enabled, attemptId])

  function reportDetection(type, details) {
    console.warn(`[DebuggerTrap] Detection: ${type} — ${details}`)
    onViolation?.(type, details)
  }

  return null // Invisible component
}
