import { useEffect, useRef } from 'react'

/**
 * TabSwitchDetector — Detects tab switches using visibilitychange + blur.
 * Warns on first switch, auto-submits on second.
 */
export default function TabSwitchDetector({ enabled = true, onViolation, onAutoSubmit }) {
  const switchCount = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        switchCount.current += 1
        if (switchCount.current >= 2) {
          if (onAutoSubmit) onAutoSubmit('Tab switching detected twice')
        } else {
          if (onViolation) onViolation('tab_switch', 'Tab switch detected via visibilitychange')
        }
      }
    }

    const handleBlur = () => {
      // Only count blur if window is not focused (tab switch, not in-page blur)
      setTimeout(() => {
        if (document.hidden) return // Already handled by visibilitychange
        switchCount.current += 1
        if (switchCount.current >= 2) {
          if (onAutoSubmit) onAutoSubmit('Tab switching detected twice')
        } else {
          if (onViolation) onViolation('tab_switch', 'Window blur detected')
        }
      }, 100)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [enabled, onViolation, onAutoSubmit])

  return null
}
