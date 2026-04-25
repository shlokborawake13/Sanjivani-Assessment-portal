import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, Camera, Mic, Maximize, Monitor, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react'

/**
 * ProctoringGate — Pre-assessment permission gate.
 * 
 * Before a proctored exam starts, this component verifies:
 * 1. Screen resolution meets minimum requirements
 * 2. Camera access (if required)
 * 3. Microphone access (if required)
 * 4. Fullscreen mode activated
 * 
 * Only renders children once ALL checks pass.
 */
export default function ProctoringGate({
  children,
  assessmentConfig = {},
  onReady,
  onFail,
}) {
  const {
    require_camera = false,
    require_mic = false,
    min_screen_width = 1024,
    min_screen_height = 768,
    exam_type = 'non_proctored',
  } = assessmentConfig

  const isProctored = exam_type === 'proctored'
  const [gateReady, setGateReady] = useState(!isProctored)

  // Check states
  const [checks, setChecks] = useState({
    screen: { status: 'pending', message: '' },
    camera: { status: require_camera ? 'pending' : 'skipped', message: '' },
    mic: { status: require_mic ? 'pending' : 'skipped', message: '' },
    fullscreen: { status: 'pending', message: '' },
  })
  const [allPassed, setAllPassed] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const streamRef = useRef(null)

  // Skip if non-proctored
  useEffect(() => {
    if (!isProctored) {
      setGateReady(true)
      onReady?.()
    }
  }, [isProctored])

  // Run checks on mount
  useEffect(() => {
    if (!isProctored) return
    runChecks()
    return () => {
      // Cleanup camera stream on unmount if gate is still showing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [isProctored])

  async function runChecks() {
    // 1. Screen resolution check
    const sw = window.screen.width
    const sh = window.screen.height
    const screenOk = sw >= min_screen_width && sh >= min_screen_height
    updateCheck('screen', screenOk ? 'passed' : 'failed',
      screenOk
        ? `${sw}×${sh} — meets requirement`
        : `${sw}×${sh} — minimum ${min_screen_width}×${min_screen_height} required`
    )

    // 2. Camera check
    if (require_camera) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        streamRef.current = stream
        updateCheck('camera', 'passed', 'Camera access granted')
      } catch (err) {
        updateCheck('camera', 'failed', 'Camera access denied — required for this exam')
        if (!screenOk) return
      }
    }

    // 3. Mic check
    if (require_mic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop()) // Stop immediately since we just needed permission
        updateCheck('mic', 'passed', 'Microphone access granted')
      } catch (err) {
        updateCheck('mic', 'failed', 'Microphone access denied — required for this exam')
      }
    }

    // 4. Fullscreen — set to waiting (user must click to enter)
    updateCheck('fullscreen', 'waiting', 'Click "Enter Fullscreen" to continue')
  }

  function updateCheck(key, status, message) {
    setChecks(prev => ({ ...prev, [key]: { status, message } }))
  }

  // Check if all passed
  useEffect(() => {
    const all = Object.values(checks).every(c => c.status === 'passed' || c.status === 'skipped')
    if (all && !allPassed) {
      setAllPassed(true)
      // Start 3-second countdown before entering exam
      setCountdown(3)
    }
  }, [checks, allPassed])

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setGateReady(true)
      onReady?.()
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen()
      updateCheck('fullscreen', 'passed', 'Fullscreen active')
    } catch (err) {
      updateCheck('fullscreen', 'failed', 'Failed to enter fullscreen')
    }
  }

  // If gate passed, render exam
  if (gateReady) return children

  // Otherwise, show gate UI
  const hasFailed = Object.values(checks).some(c => c.status === 'failed')

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-8 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Proctored Exam — System Check</h2>
          <p className="text-gray-400 text-sm">
            This exam requires proctoring. Please allow the permissions below to continue.
          </p>
        </div>

        {/* Checks */}
        <div className="space-y-3 mb-8">
          <CheckItem
            icon={<Monitor size={18} />}
            label="Screen Resolution"
            check={checks.screen}
          />
          {require_camera && (
            <CheckItem
              icon={<Camera size={18} />}
              label="Camera Access"
              check={checks.camera}
            />
          )}
          {require_mic && (
            <CheckItem
              icon={<Mic size={18} />}
              label="Microphone Access"
              check={checks.mic}
            />
          )}
          <CheckItem
            icon={<Maximize size={18} />}
            label="Fullscreen Mode"
            check={checks.fullscreen}
            action={checks.fullscreen.status === 'waiting' ? (
              <button
                onClick={enterFullscreen}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Enter Fullscreen
              </button>
            ) : null}
          />
        </div>

        {/* Status */}
        {allPassed && countdown !== null && (
          <div className="text-center">
            <div className="text-5xl font-bold text-green-400 mb-2">{countdown}</div>
            <p className="text-gray-400 text-sm">Entering exam...</p>
          </div>
        )}

        {hasFailed && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-400 text-sm font-medium">
              Some checks failed. Please resolve them to continue.
            </p>
            <button
              onClick={() => {
                setChecks({
                  screen: { status: 'pending', message: '' },
                  camera: { status: require_camera ? 'pending' : 'skipped', message: '' },
                  mic: { status: require_mic ? 'pending' : 'skipped', message: '' },
                  fullscreen: { status: 'pending', message: '' },
                })
                setAllPassed(false)
                setCountdown(null)
                runChecks()
              }}
              className="mt-3 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-semibold rounded-lg transition-colors"
            >
              Retry All Checks
            </button>
          </div>
        )}

        {/* Rules */}
        <div className="mt-6 pt-6 border-t border-white/5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Exam Rules</h3>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li>• Do NOT switch tabs or exit fullscreen</li>
            <li>• Do NOT open DevTools or other browser windows</li>
            <li>• Keep your face visible in the camera at all times</li>
            <li>• Multiple violations will trigger auto-submission</li>
            <li>• All activity is monitored and logged server-side</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function CheckItem({ icon, label, check, action }) {
  const statusStyles = {
    pending: 'text-gray-500 bg-white/5',
    waiting: 'text-amber-400 bg-amber-500/10',
    passed: 'text-green-400 bg-green-500/10',
    failed: 'text-red-400 bg-red-500/10',
    skipped: 'text-gray-500 bg-white/5',
  }

  const StatusIcon = {
    pending: <Loader2 size={14} className="animate-spin text-gray-500" />,
    waiting: <AlertTriangle size={14} className="text-amber-400" />,
    passed: <CheckCircle2 size={14} className="text-green-400" />,
    failed: <XCircle size={14} className="text-red-400" />,
    skipped: <CheckCircle2 size={14} className="text-gray-500" />,
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
      check.status === 'failed'
        ? 'border-red-500/20 bg-red-500/5'
        : check.status === 'passed'
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-white/5 bg-white/[0.02]'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusStyles[check.status]}`}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          {check.message && (
            <div className={`text-[11px] mt-0.5 ${
              check.status === 'failed' ? 'text-red-400' :
              check.status === 'passed' ? 'text-green-400/70' :
              'text-gray-500'
            }`}>
              {check.message}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {StatusIcon[check.status]}
      </div>
    </div>
  )
}
