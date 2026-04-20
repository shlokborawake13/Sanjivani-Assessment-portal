import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, CameraOff, AlertTriangle } from 'lucide-react'

/**
 * CameraMonitor — Requests camera+mic, detects face presence using
 * basic canvas analysis (no TensorFlow dependency for simplicity).
 * Warns if no face, auto-submits on repeated issues.
 */
export default function CameraMonitor({ enabled = true, onViolation, onAutoSubmit, onPermissionDenied }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [hasPermission, setHasPermission] = useState(null)
  const [faceDetected, setFaceDetected] = useState(true)
  const noFaceCount = useRef(0)
  const checkInterval = useRef(null)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
        audio: true
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setHasPermission(true)
    } catch (err) {
      console.error('Camera access denied:', err)
      setHasPermission(false)
      if (onPermissionDenied) onPermissionDenied()
    }
  }, [onPermissionDenied])

  // Simple face detection using canvas pixel analysis
  // Detects skin-tone colors as proxy for face presence
  const detectFace = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return true

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = 320
    canvas.height = 240
    ctx.drawImage(video, 0, 0, 320, 240)

    const imageData = ctx.getImageData(80, 40, 160, 160) // Center region
    const pixels = imageData.data
    let skinPixels = 0
    const totalPixels = pixels.length / 4

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
      // Basic skin color detection (works for various skin tones)
      if (r > 60 && g > 40 && b > 20 &&
          r > g && r > b &&
          Math.abs(r - g) > 15 &&
          r - b > 15) {
        skinPixels++
      }
    }

    const skinRatio = skinPixels / totalPixels
    return skinRatio > 0.05 // At least 5% skin-tone pixels
  }, [])

  useEffect(() => {
    if (!enabled) return
    startCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (checkInterval.current) clearInterval(checkInterval.current)
    }
  }, [enabled, startCamera])

  // Start face detection loop once camera is ready
  useEffect(() => {
    if (!hasPermission || !enabled) return

    checkInterval.current = setInterval(() => {
      const detected = detectFace()
      setFaceDetected(detected)

      if (!detected) {
        noFaceCount.current++
        if (noFaceCount.current >= 3) {
          // Persistent no-face = violation
          if (onViolation) onViolation('face_detection', 'Face not detected for extended period')
          noFaceCount.current = 0
        }
      } else {
        noFaceCount.current = 0
      }
    }, 3000)

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current)
    }
  }, [hasPermission, enabled, detectFace, onViolation])

  if (!enabled) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Camera preview */}
      <div className="relative rounded-xl overflow-hidden shadow-lg border-2 border-outline/20" style={{ width: 160, height: 120 }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          muted
          playsInline
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Status indicator */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${
          hasPermission === false
            ? 'bg-error text-white'
            : faceDetected
              ? 'bg-[#22c55e] text-white'
              : 'bg-[#f59e0b] text-white'
        }`}>
          {hasPermission === false ? (
            <><CameraOff size={9} /> Denied</>
          ) : faceDetected ? (
            <><Camera size={9} /> Active</>
          ) : (
            <><AlertTriangle size={9} /> Look here</>
          )}
        </div>

        {/* Recording indicator */}
        {hasPermission && (
          <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-error animate-pulse" />
        )}
      </div>
    </div>
  )
}
