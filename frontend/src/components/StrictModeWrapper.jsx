import { useEffect, useCallback } from 'react'

/**
 * StrictModeWrapper — Client-side security restrictions.
 * 
 * THIS IS A DETERRENT, NOT A SECURITY BOUNDARY.
 * Real security comes from the server-side proctoring engine.
 * 
 * Blocks:
 * - Right-click context menu
 * - Copy, cut, paste
 * - Print screen, Ctrl+P, Ctrl+S
 * - DevTools shortcuts (F12, Ctrl+Shift+I/J/C)
 * - Alt+Tab detection (via blur)
 * - Ctrl+A (select all), Ctrl+F (find)
 * - PrintScreen key
 */
export default function StrictModeWrapper({ enabled = true, allowTextInput = false, onViolation, children }) {
  // Block context menu
  const handleContextMenu = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    onViolation?.('right_click', 'Right-click context menu blocked')
  }, [enabled, onViolation])

  // Block copy/cut/paste
  const handleCopy = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    onViolation?.('copy_attempt', 'Copy blocked')
  }, [enabled, onViolation])

  const handleCut = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    onViolation?.('copy_attempt', 'Cut blocked')
  }, [enabled, onViolation])

  const handlePaste = useCallback((e) => {
    if (!enabled) return
    // Allow paste in textareas when allowTextInput is true
    if (allowTextInput && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable)) return
    e.preventDefault()
    onViolation?.('paste_attempt', 'Paste blocked')
  }, [enabled, onViolation])

  // Block keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (!enabled) return

    // F12 — DevTools
    if (e.key === 'F12') {
      e.preventDefault()
      e.stopPropagation()
      onViolation?.('devtools_attempt', 'F12 pressed')
      return
    }

    // PrintScreen
    if (e.key === 'PrintScreen') {
      e.preventDefault()
      onViolation?.('screenshot_attempt', 'PrintScreen pressed')
      return
    }

    const ctrl = e.ctrlKey || e.metaKey

    if (ctrl) {
      const key = e.key.toLowerCase()

      // Ctrl+Shift combinations
      if (e.shiftKey) {
        if (['i', 'j', 'c'].includes(key)) {
          e.preventDefault()
          e.stopPropagation()
          onViolation?.('devtools_attempt', `Ctrl+Shift+${key.toUpperCase()} pressed`)
          return
        }
      }

      // Ctrl+key combinations
      const blockedKeys = {
        'c': 'copy',
        'v': 'paste',
        'x': 'cut',
        'p': 'print',
        's': 'save',
        'u': 'view_source',
        'f': 'find',
      }
      // Only block select-all when NOT in text input mode
      if (!allowTextInput) blockedKeys['a'] = 'select_all'

      if (blockedKeys[key]) {
        // When allowTextInput, allow paste/cut in text inputs
        if (allowTextInput && ['v', 'x'].includes(key)) {
          const tag = e.target?.tagName
          if (tag === 'TEXTAREA' || tag === 'INPUT' || e.target?.isContentEditable) return
        }
        e.preventDefault()
        e.stopPropagation()
        // Only report copy/paste/devtools as violations
        if (['c', 'v', 'x', 'u'].includes(key)) {
          onViolation?.(`${blockedKeys[key]}_attempt`, `Ctrl+${key.toUpperCase()} pressed`)
        }
        return
      }
    }

    // Alt+Tab (we can't truly block this, but we detect the blur)
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault()
      onViolation?.('alt_tab', 'Alt+Tab pressed')
      return
    }
  }, [enabled, onViolation, allowTextInput])

  // Block drag
  const handleDragStart = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('copy', handleCopy, true)
    document.addEventListener('cut', handleCut, true)
    document.addEventListener('paste', handlePaste, true)
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('dragstart', handleDragStart, true)

    // Disable text selection via CSS (skip for text input mode)
    if (!allowTextInput) {
      document.body.style.userSelect = 'none'
      document.body.style.webkitUserSelect = 'none'
    }

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('copy', handleCopy, true)
      document.removeEventListener('cut', handleCut, true)
      document.removeEventListener('paste', handlePaste, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
    }
  }, [enabled, handleContextMenu, handleCopy, handleCut, handlePaste, handleKeyDown, handleDragStart])

  return <>{children}</>
}
