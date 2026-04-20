import { useEffect, useCallback } from 'react'

/**
 * StrictModeWrapper — Disables right-click, copy, paste, cut, text selection,
 * and detects DevTools. Wraps any assessment page.
 */
export default function StrictModeWrapper({ children, enabled = true, onViolation }) {
  const logViolation = useCallback((type, details) => {
    if (onViolation) onViolation(type, details)
  }, [onViolation])

  useEffect(() => {
    if (!enabled) return

    // Disable right-click
    const handleContextMenu = (e) => {
      e.preventDefault()
      logViolation('right_click', 'Right-click attempted')
    }

    // Disable copy, paste, cut
    const handleCopy = (e) => { e.preventDefault(); logViolation('copy_attempt', 'Copy attempted') }
    const handlePaste = (e) => { e.preventDefault(); logViolation('paste_attempt', 'Paste attempted') }
    const handleCut = (e) => { e.preventDefault(); logViolation('copy_attempt', 'Cut attempted') }

    // Disable keyboard shortcuts
    const handleKeyDown = (e) => {
      // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A
      if (e.ctrlKey && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        if (e.key.toLowerCase() === 'v') logViolation('paste_attempt', 'Ctrl+V attempted')
        else if (e.key.toLowerCase() === 'c') logViolation('copy_attempt', 'Ctrl+C attempted')
        return
      }
      // Ctrl+Shift+I (DevTools), F12
      if ((e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'F12') {
        e.preventDefault()
        logViolation('devtools', 'DevTools shortcut attempted')
        return
      }
      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault()
        logViolation('devtools', 'Console shortcut attempted')
        return
      }
      // Ctrl+U (View source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault()
        logViolation('devtools', 'View source attempted')
        return
      }
    }

    // Detect DevTools via window size
    let devtoolsOpen = false
    const checkDevTools = () => {
      const threshold = 160
      const widthDiff = window.outerWidth - window.innerWidth > threshold
      const heightDiff = window.outerHeight - window.innerHeight > threshold
      if ((widthDiff || heightDiff) && !devtoolsOpen) {
        devtoolsOpen = true
        logViolation('devtools', 'DevTools possibly opened (window resize detected)')
      } else if (!widthDiff && !heightDiff) {
        devtoolsOpen = false
      }
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('cut', handleCut)
    document.addEventListener('keydown', handleKeyDown)
    const devtoolsInterval = setInterval(checkDevTools, 2000)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('keydown', handleKeyDown)
      clearInterval(devtoolsInterval)
    }
  }, [enabled, logViolation])

  if (!enabled) return children

  return (
    <div
      style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}
