import { useEffect, useRef } from 'react'

/**
 * TabSwitchDetector — Detects tab switches using visibilitychange.
 * The blur handler is removed because it falsely fires when clicking
 * into textareas, inputs, or interacting with in-page elements.
 * Warns on first switch, auto-submits on second.
 */
export default function TabSwitchDetector({ enabled = true, onViolation, onAutoSubmit }) {
  const switchCount = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        switchCount.current += 1
        if (switchCount.current >= 3) {
          // Auto-submit on 3rd tab switch (more lenient)
          if (onAutoSubmit) onAutoSubmit('Tab switching detected multiple times')
        } else {
          if (onViolation) onViolation('tab_switch', `Tab switch detected (${switchCount.current}/3)`)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, onViolation, onAutoSubmit])

  return null
}
