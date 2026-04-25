import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, CameraOff, AlertTriangle, Users, User } from 'lucide-react'

/**
 * CameraMonitor — Production-grade face detection using TensorFlow.js BlazeFace.
 * 
 * Capabilities:
 * - Real multi-face detection (not skin-tone heuristic)
 * - Face count tracking (single vs multiple)
 * - No-face detection with configurable thresholds
 * - Reports all events to violation handler + proctoring heartbeat
 * 
 * The backend validates face events server-side via heartbeat.
 * This component only provides the client-side signal.
 */
export default function CameraMonitor({
  enabled = true,
  onViolation,
  onFaceStatus,  // ({ detected, count }) => void
  onCameraStatus, // (active: boolean) => void
  showPreview = true,
  className = '',
}) {
  const [cameraActive, setCameraActive] = useState(false)
  const [faceCount, setFaceCount] = useState(0)
  const [faceDetected, setFaceDetected] = useState(true)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [error, setError] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const modelRef = useRef(null)
  const detectionRef = useRef(null)
  const noFaceCountRef = useRef(0)
  const multiFaceCountRef = useRef(0)

  const NO_FACE_WARN_THRESHOLD = 5    // 5 consecutive no-face (~5 seconds)
  const MULTI_FACE_WARN_THRESHOLD = 2 // 2 consecutive multi-face

  // Load BlazeFace model
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function loadModel() {
      try {
        // Dynamic import to avoid bundling if not needed
        const tf = await import('@tensorflow/tfjs')
        const blazeface = await import('@tensorflow-models/blazeface')
        
        // Set backend
        await tf.setBackend('webgl')
        await tf.ready()

        const model = await blazeface.load()
        if (!cancelled) {
          modelRef.current = model
          setModelLoaded(true)
          console.log('[CameraMonitor] BlazeFace model loaded')
        }
      } catch (err) {
        console.error('[CameraMonitor] Model load error:', err)
        // Fall back to basic operation without ML
        if (!cancelled) {
          setModelLoaded(false)
          setError('Face detection model failed to load')
        }
      }
    }

    loadModel()
    return () => { cancelled = true }
  }, [enabled])

  // Start camera
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' }
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setCameraActive(true)
        onCameraStatus?.(true)
      } catch (err) {
        console.error('[CameraMonitor] Camera error:', err)
        setCameraActive(false)
        onCameraStatus?.(false)
        setError('Camera access denied')
        onViolation?.('camera_denied', 'Camera access was denied')
      }
    }

    startCamera()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [enabled])

  // Face detection loop
  useEffect(() => {
    if (!enabled || !cameraActive || !modelLoaded || !modelRef.current) return

    let running = true

    async function detect() {
      if (!running || !videoRef.current || !modelRef.current) return
      
      const video = videoRef.current
      if (video.readyState < 2) {
        // Video not ready yet
        detectionRef.current = requestAnimationFrame(detect)
        return
      }

      try {
        const predictions = await modelRef.current.estimateFaces(video, false)
        const count = predictions.length

        setFaceCount(count)
        const detected = count > 0
        setFaceDetected(detected)
        onFaceStatus?.({ detected, count })

        // No face detected
        if (!detected) {
          noFaceCountRef.current++
          if (noFaceCountRef.current >= NO_FACE_WARN_THRESHOLD) {
            onViolation?.('no_face', `No face detected for ${noFaceCountRef.current} consecutive frames`)
            noFaceCountRef.current = 0 // Reset after reporting
          }
        } else {
          noFaceCountRef.current = 0
        }

        // Multiple faces detected
        if (count > 1) {
          multiFaceCountRef.current++
          if (multiFaceCountRef.current >= MULTI_FACE_WARN_THRESHOLD) {
            onViolation?.('multiple_faces', `${count} faces detected for ${multiFaceCountRef.current} consecutive frames`)
            multiFaceCountRef.current = 0
          }
        } else {
          multiFaceCountRef.current = 0
        }

        // Draw bounding boxes on canvas (if preview mode)
        if (showPreview && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')
          canvasRef.current.width = video.videoWidth || 320
          canvasRef.current.height = video.videoHeight || 240
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

          predictions.forEach((pred, idx) => {
            const start = pred.topLeft
            const end = pred.bottomRight
            const size = [end[0] - start[0], end[1] - start[1]]

            ctx.strokeStyle = count > 1 ? '#ef4444' : '#22c55e'
            ctx.lineWidth = 2
            ctx.strokeRect(start[0], start[1], size[0], size[1])

            // Draw landmarks
            if (pred.landmarks) {
              ctx.fillStyle = '#3b82f6'
              pred.landmarks.forEach(point => {
                ctx.beginPath()
                ctx.arc(point[0], point[1], 2, 0, 2 * Math.PI)
                ctx.fill()
              })
            }
          })
        }
      } catch (err) {
        // Non-fatal, continue detecting
      }

      // Run at ~1 FPS for performance (detection every 1 second)
      if (running) {
        setTimeout(() => {
          detectionRef.current = requestAnimationFrame(detect)
        }, 1000)
      }
    }

    detect()

    return () => {
      running = false
      if (detectionRef.current) cancelAnimationFrame(detectionRef.current)
    }
  }, [enabled, cameraActive, modelLoaded, showPreview])

  if (!enabled) return null

  if (!showPreview) return null

  return (
    <div className={`relative overflow-hidden rounded-xl border ${
      !cameraActive ? 'border-red-500/30 bg-red-500/5' :
      faceCount > 1 ? 'border-red-500/30 bg-red-500/5' :
      faceCount === 0 ? 'border-amber-500/30 bg-amber-500/5' :
      'border-green-500/20 bg-green-500/5'
    } ${className}`}>
      {/* Video + Canvas overlay */}
      <div className="relative" style={{ width: 160, height: 120 }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Status overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {cameraActive ? (
                <Camera size={10} className="text-green-400" />
              ) : (
                <CameraOff size={10} className="text-red-400" />
              )}
              <span className="text-[9px] font-medium text-white/80">
                {!modelLoaded ? 'Loading...' :
                 !cameraActive ? 'No Camera' :
                 faceCount === 0 ? 'No Face' :
                 faceCount > 1 ? `${faceCount} Faces!` :
                 'OK'}
              </span>
            </div>
            <div>
              {faceCount > 1 && <Users size={10} className="text-red-400" />}
              {faceCount === 1 && <User size={10} className="text-green-400" />}
              {faceCount === 0 && cameraActive && <AlertTriangle size={10} className="text-amber-400" />}
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] text-center">
          {error}
        </div>
      )}
    </div>
  )
}
