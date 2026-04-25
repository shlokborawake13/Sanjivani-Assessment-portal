import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2 } from 'lucide-react'

/**
 * AudioMonitor — Microphone monitoring for Communication assessments.
 * 
 * Uses Web Audio API to:
 * - Detect extended silence (student may have left)
 * - Detect noise spikes (possible external conversation)
 * - Report anomalies to violation handler + proctoring heartbeat
 * 
 * ONLY used for Communication assessments (as per requirements).
 */
export default function AudioMonitor({
  enabled = false,
  onViolation,
  onAudioLevel,
  showIndicator = true,
}) {
  const [micActive, setMicActive] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [status, setStatus] = useState('initializing') // initializing, active, denied, error

  const streamRef = useRef(null)
  const contextRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const silenceCountRef = useRef(0)
  const spikeCountRef = useRef(0)

  const SILENCE_THRESHOLD = 0.02
  const SPIKE_THRESHOLD = 0.8
  const SILENCE_WARN_AFTER = 60  // ~60 seconds of silence
  const SPIKE_WARN_AFTER = 3     // 3 consecutive spikes

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        contextRef.current = ctx

        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        source.connect(analyser)
        analyserRef.current = analyser

        setMicActive(true)
        setStatus('active')

        // Start level monitoring
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        function checkLevel() {
          if (cancelled) return
          analyser.getByteFrequencyData(dataArray)

          // Calculate RMS level (0-1)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 255
            sum += v * v
          }
          const rms = Math.sqrt(sum / dataArray.length)
          setAudioLevel(rms)
          onAudioLevel?.(rms)

          // Silence detection
          if (rms < SILENCE_THRESHOLD) {
            silenceCountRef.current++
            if (silenceCountRef.current >= SILENCE_WARN_AFTER) {
              onViolation?.('audio_silence', `Extended silence detected (${silenceCountRef.current}s)`)
              silenceCountRef.current = 0 // Reset
            }
          } else {
            silenceCountRef.current = 0
          }

          // Spike detection
          if (rms > SPIKE_THRESHOLD) {
            spikeCountRef.current++
            if (spikeCountRef.current >= SPIKE_WARN_AFTER) {
              onViolation?.('audio_spike', `Audio spike detected (level: ${rms.toFixed(2)})`)
              spikeCountRef.current = 0
            }
          } else {
            spikeCountRef.current = 0
          }

          animFrameRef.current = requestAnimationFrame(checkLevel)
        }
        checkLevel()

      } catch (err) {
        console.error('AudioMonitor init error:', err)
        setStatus('denied')
        setMicActive(false)
        onViolation?.('mic_denied', 'Microphone access denied')
      }
    }

    startAudio()

    return () => {
      cancelled = true
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (contextRef.current) contextRef.current.close().catch(() => {})
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [enabled])

  if (!enabled || !showIndicator) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/5">
      {micActive ? (
        <>
          <Mic size={12} className="text-green-400" />
          <div className="flex items-center gap-1">
            {/* Audio level bars */}
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((threshold, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  audioLevel >= threshold ? 'bg-green-400' : 'bg-white/10'
                }`}
                style={{ height: `${8 + i * 3}px` }}
              />
            ))}
          </div>
          <span className="text-gray-400 ml-1">Mic</span>
        </>
      ) : (
        <>
          <MicOff size={12} className="text-red-400" />
          <span className="text-red-400">No Mic</span>
        </>
      )}
    </div>
  )
}
