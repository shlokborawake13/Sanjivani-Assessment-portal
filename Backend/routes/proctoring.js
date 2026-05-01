import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'
import { rateLimiter } from '../middleware/rateLimit.js'

const router = Router()
router.use(authenticate)

// ─── Constants ──────────────────────────────────────────────
const HEARTBEAT_TIMEOUT_MS = 30_000  // 30 seconds — if no heartbeat, flag
const HEARTBEAT_CRITICAL_MS = 60_000 // 60 seconds — auto-submit
const MAX_MISSED_HEARTBEATS = 5      // After 5 missed → auto-submit
const FACE_ABSENT_THRESHOLD = 3      // 3 consecutive no-face → violation
const MULTI_FACE_THRESHOLD = 2       // 2 consecutive multi-face → auto-submit
const AUDIO_SPIKE_DB = 0.8           // Audio level above this = noise spike
const AUDIO_SILENT_CHECKS = 10       // 10 consecutive silence checks = suspicious

// ─── In-memory state for real-time tracking ─────────────────
// This supplements the DB — used for fast checks without DB roundtrip
const liveState = new Map()

function getLiveState(attemptId) {
  return liveState.get(attemptId) || null
}

function setLiveState(attemptId, data) {
  liveState.set(attemptId, { ...data, updatedAt: Date.now() })
  // Cleanup after 4 hours
  setTimeout(() => liveState.delete(attemptId), 4 * 60 * 60 * 1000)
}

// ─── POST /api/proctoring/start — Initialize proctoring session ──
router.post('/start', async (req, res) => {
  try {
    const { attempt_id, screen_width, screen_height, user_agent } = req.body
    if (!attempt_id) return res.status(400).json({ error: 'attempt_id is required' })

    // Verify attempt belongs to user and is in progress
    const { data: attempt, error: aErr } = await supabaseAdmin
      .from('attempts')
      .select('id, user_id, assessment_id, status, assessments(min_screen_width, min_screen_height, require_camera, require_mic, max_violations, exam_type, proctoring_strictness)')
      .eq('id', attempt_id)
      .maybeSingle()

    if (aErr || !attempt) return res.status(404).json({ error: 'Attempt not found' })
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Attempt not in progress' })

    const assessment = attempt.assessments || {}

    // ── SERVER-SIDE SCREEN SIZE ENFORCEMENT ──
    const minW = assessment.min_screen_width || 1024
    const minH = assessment.min_screen_height || 768
    const sw = parseInt(screen_width) || 0
    const sh = parseInt(screen_height) || 0

    if (sw < minW || sh < minH) {
      // Log violation
      await supabaseAdmin.from('violations').insert({
        attempt_id,
        type: 'screen_size_too_small',
        details: `Screen ${sw}x${sh} below minimum ${minW}x${minH}`,
        severity: 'critical',
        source: 'server'
      })

      return res.status(400).json({
        error: 'Screen resolution too small',
        required: `${minW}x${minH}`,
        actual: `${sw}x${sh}`,
        blocked: true
      })
    }

    // Create proctoring session
    const { data: session, error: sErr } = await supabaseAdmin
      .from('proctoring_sessions')
      .insert({
        attempt_id,
        user_id: req.user.id,
        screen_width: sw,
        screen_height: sh,
        user_agent: (user_agent || req.headers['user-agent'] || '').substring(0, 500),
        camera_active: false,
        mic_active: false,
        fullscreen_active: true,
        face_detected: true,
        face_count: 1,
        audio_level: 0,
        last_heartbeat: new Date().toISOString(),
        heartbeat_count: 0,
        missed_heartbeats: 0,
      })
      .select()
      .maybeSingle()

    if (sErr) {
      console.error('Proctoring session create error:', sErr)
      return res.status(500).json({ error: 'Failed to create proctoring session' })
    }

    // Update attempt with proctoring session ID and device info
    await supabaseAdmin
      .from('attempts')
      .update({
        proctoring_session_id: session.id,
        screen_width: sw,
        screen_height: sh,
        user_agent: (user_agent || req.headers['user-agent'] || '').substring(0, 500)
      })
      .eq('id', attempt_id)

    // Initialize live state
    setLiveState(attempt_id, {
      sessionId: session.id,
      userId: req.user.id,
      assessmentId: attempt.assessment_id,
      faceAbsentCount: 0,
      multiFaceCount: 0,
      silentCheckCount: 0,
      totalViolations: 0,
      maxViolations: assessment.max_violations || 3,
      requireCamera: assessment.require_camera || false,
      requireMic: assessment.require_mic || false,
      strictness: assessment.proctoring_strictness || 'standard',
      autoSubmitted: false,
    })

    res.status(201).json({
      session_id: session.id,
      config: {
        heartbeat_interval: 5000,
        max_violations: assessment.max_violations || 3,
        require_camera: assessment.require_camera || false,
        require_mic: assessment.require_mic || false,
        strictness: assessment.proctoring_strictness || 'standard',
      }
    })
  } catch (err) {
    console.error('Proctoring start error:', err)
    res.status(500).json({ error: 'Failed to start proctoring' })
  }
})

// ─── POST /api/proctoring/:attemptId/heartbeat — Client heartbeat ──
router.post(
  '/:attemptId/heartbeat',
  rateLimiter({ windowMs: 10000, max: 5, message: 'Heartbeat rate limit' }),
  async (req, res) => {
    try {
      const { attemptId } = req.params
      const {
        camera_active, mic_active, fullscreen_active,
        face_detected, face_count, audio_level,
        screen_width, screen_height
      } = req.body

      const live = getLiveState(attemptId)
      if (!live) {
        // Try to reload from DB
        const { data: session } = await supabaseAdmin
          .from('proctoring_sessions')
          .select('*')
          .eq('attempt_id', attemptId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!session) return res.status(404).json({ error: 'No proctoring session' })

        // Verify ownership
        if (session.user_id !== req.user.id) {
          return res.status(403).json({ error: 'Not authorized' })
        }

        // Reconstruct live state
        setLiveState(attemptId, {
          sessionId: session.id,
          userId: session.user_id,
          faceAbsentCount: 0,
          multiFaceCount: 0,
          silentCheckCount: 0,
          totalViolations: 0,
          maxViolations: 3,
          requireCamera: false,
          requireMic: false,
          strictness: 'standard',
          autoSubmitted: false,
        })
      }

      const state = getLiveState(attemptId)
      if (!state || state.autoSubmitted) {
        return res.json({ status: 'auto_submitted' })
      }

      // Verify owner
      if (state.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' })
      }

      const violations = []
      let shouldAutoSubmit = false
      let autoSubmitReason = ''

      // ── SERVER-SIDE ENFORCEMENT: Screen size re-check ──
      const sw = parseInt(screen_width) || 0
      const sh = parseInt(screen_height) || 0
      if (sw > 0 && sh > 0 && (sw < 1024 || sh < 768)) {
        violations.push({
          type: 'screen_resize',
          details: `Screen resized to ${sw}x${sh}`,
          severity: 'major'
        })
      }

      // ── SERVER-SIDE ENFORCEMENT: Fullscreen check ──
      if (fullscreen_active === false) {
        violations.push({
          type: 'fullscreen_exit',
          details: 'Fullscreen not active during heartbeat',
          severity: 'major'
        })
      }

      // ── SERVER-SIDE ENFORCEMENT: Face detection ──
      if (state.requireCamera) {
        if (!camera_active) {
          violations.push({
            type: 'camera_disabled',
            details: 'Camera not active',
            severity: 'critical'
          })
          shouldAutoSubmit = true
          autoSubmitReason = 'Camera disabled during proctored exam'
        }

        if (!face_detected) {
          state.faceAbsentCount = (state.faceAbsentCount || 0) + 1
          if (state.faceAbsentCount >= FACE_ABSENT_THRESHOLD) {
            violations.push({
              type: 'face_absent',
              details: `No face detected for ${state.faceAbsentCount} consecutive checks`,
              severity: 'critical'
            })
            if (state.strictness === 'strict') {
              shouldAutoSubmit = true
              autoSubmitReason = 'No face detected for extended period'
            }
          }
        } else {
          state.faceAbsentCount = 0
        }

        // Multi-face detection
        const fc = parseInt(face_count) || 0
        if (fc > 1) {
          state.multiFaceCount = (state.multiFaceCount || 0) + 1
          violations.push({
            type: 'multiple_faces',
            details: `${fc} faces detected (check ${state.multiFaceCount})`,
            severity: 'critical'
          })
          if (state.multiFaceCount >= MULTI_FACE_THRESHOLD) {
            shouldAutoSubmit = true
            autoSubmitReason = `Multiple faces detected ${state.multiFaceCount} consecutive times`
          }
        } else {
          state.multiFaceCount = 0
        }
      }

      // ── SERVER-SIDE ENFORCEMENT: Audio monitoring (Communication ONLY) ──
      if (state.requireMic) {
        const level = parseFloat(audio_level) || 0
        if (level > AUDIO_SPIKE_DB) {
          violations.push({
            type: 'audio_anomaly',
            details: `Audio spike: level ${level.toFixed(2)}`,
            severity: 'major'
          })
        }
        if (level < 0.01) {
          state.silentCheckCount = (state.silentCheckCount || 0) + 1
          if (state.silentCheckCount >= AUDIO_SILENT_CHECKS) {
            violations.push({
              type: 'audio_silence',
              details: `Silence detected for ${state.silentCheckCount} consecutive checks`,
              severity: 'minor'
            })
            state.silentCheckCount = 0 // Reset to avoid flooding
          }
        } else {
          state.silentCheckCount = 0
        }
      }

      // ── Log violations to DB ──
      if (violations.length > 0) {
        const records = violations.map(v => ({
          attempt_id: attemptId,
          type: v.type,
          details: v.details,
          severity: v.severity,
          source: 'server'
        }))
        try { await supabaseAdmin.from('violations').insert(records) } catch {}
        state.totalViolations += violations.length
      }

      // ── Check total violations against threshold ──
      if (!shouldAutoSubmit && state.totalViolations >= state.maxViolations) {
        shouldAutoSubmit = true
        autoSubmitReason = `Total violations (${state.totalViolations}) exceeded maximum (${state.maxViolations})`
      }

      // ── Auto-submit if triggered ──
      if (shouldAutoSubmit && !state.autoSubmitted) {
        state.autoSubmitted = true
        await serverAutoSubmit(attemptId, autoSubmitReason)
      }

      // ── Update proctoring session in DB ──
      try {
        await supabaseAdmin
          .from('proctoring_sessions')
          .update({
            camera_active: !!camera_active,
            mic_active: !!mic_active,
            fullscreen_active: fullscreen_active !== false,
            face_detected: !!face_detected,
            face_count: parseInt(face_count) || 0,
            audio_level: parseFloat(audio_level) || 0,
            last_heartbeat: new Date().toISOString(),
            heartbeat_count: (state.heartbeatCount || 0) + 1,
            is_suspicious: state.totalViolations > 0,
            suspicious_reasons: violations.length > 0
              ? violations.map(v => ({ type: v.type, at: new Date().toISOString() }))
              : undefined
          })
          .eq('id', state.sessionId)
      } catch {}

      state.heartbeatCount = (state.heartbeatCount || 0) + 1
      setLiveState(attemptId, state)

      res.json({
        status: state.autoSubmitted ? 'auto_submitted' : 'ok',
        violations_logged: violations.length,
        total_violations: state.totalViolations,
        max_violations: state.maxViolations,
        auto_submit_reason: state.autoSubmitted ? autoSubmitReason : undefined,
      })
    } catch (err) {
      console.error('Heartbeat error:', err)
      res.status(500).json({ error: 'Heartbeat failed' })
    }
  }
)

// ─── POST /api/proctoring/:attemptId/face-event — Face detection events ──
router.post('/:attemptId/face-event', async (req, res) => {
  try {
    const { attemptId } = req.params
    const { event_type, face_count, details } = req.body

    // Validate
    if (!event_type) return res.status(400).json({ error: 'event_type required' })

    const severity = event_type === 'multiple_faces' ? 'critical'
      : event_type === 'no_face' ? 'major'
      : 'minor'

    await supabaseAdmin.from('violations').insert({
      attempt_id: attemptId,
      type: event_type,
      details: details || `Face event: ${event_type}, count: ${face_count}`,
      severity,
      source: 'client'
    })

    // Update live state
    const state = getLiveState(attemptId)
    if (state) {
      state.totalViolations++

      if (event_type === 'multiple_faces') {
        state.multiFaceCount++
        if (state.multiFaceCount >= MULTI_FACE_THRESHOLD && !state.autoSubmitted) {
          state.autoSubmitted = true
          await serverAutoSubmit(attemptId, 'Multiple faces detected repeatedly')
          return res.json({ autoSubmitted: true, reason: 'Multiple faces detected' })
        }
      }

      if (state.totalViolations >= state.maxViolations && !state.autoSubmitted) {
        state.autoSubmitted = true
        await serverAutoSubmit(attemptId, 'Violation threshold exceeded')
        return res.json({ autoSubmitted: true, reason: 'Violation limit reached' })
      }

      setLiveState(attemptId, state)
    }

    res.json({ logged: true })
  } catch (err) {
    console.error('Face event error:', err)
    res.status(500).json({ error: 'Failed to log face event' })
  }
})

// ─── POST /api/proctoring/:attemptId/audio-event — Audio anomalies ──
router.post('/:attemptId/audio-event', async (req, res) => {
  try {
    const { attemptId } = req.params
    const { event_type, audio_level, details } = req.body

    await supabaseAdmin.from('violations').insert({
      attempt_id: attemptId,
      type: event_type || 'audio_anomaly',
      details: details || `Audio level: ${audio_level}`,
      severity: 'major',
      source: 'client'
    })

    const state = getLiveState(attemptId)
    if (state) {
      state.totalViolations++
      if (state.totalViolations >= state.maxViolations && !state.autoSubmitted) {
        state.autoSubmitted = true
        await serverAutoSubmit(attemptId, 'Audio anomaly + violation threshold')
        return res.json({ autoSubmitted: true })
      }
      setLiveState(attemptId, state)
    }

    res.json({ logged: true })
  } catch (err) {
    console.error('Audio event error:', err)
    res.status(500).json({ error: 'Failed to log audio event' })
  }
})

// ─── GET /api/proctoring/:attemptId/status — Admin: view proctoring status ──
router.get('/:attemptId/status', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { attemptId } = req.params

    const { data: session } = await supabaseAdmin
      .from('proctoring_sessions')
      .select('*')
      .eq('attempt_id', attemptId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: violations } = await supabaseAdmin
      .from('violations')
      .select('*')
      .eq('attempt_id', attemptId)
      .order('created_at', { ascending: true })

    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('id, status, score, total, percentage, violation_count, auto_submitted, submission_reason, screen_width, screen_height, profiles(name, email, prn)')
      .eq('id', attemptId)
      .maybeSingle()

    res.json({
      session: session || null,
      violations: violations || [],
      attempt: attempt || null,
      live_state: getLiveState(attemptId) || null
    })
  } catch (err) {
    console.error('Proctoring status error:', err)
    res.status(500).json({ error: 'Failed to fetch proctoring status' })
  }
})

// ─── GET /api/proctoring/violations — Admin: list all violations ──
router.get('/violations/all', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { assessment_id, severity, type, limit: limitParam } = req.query
    const pageLimit = Math.min(parseInt(limitParam) || 100, 500)

    let query = supabaseAdmin
      .from('violations')
      .select('*, attempts(user_id, assessment_id, status, profiles(name, email, prn, department), assessments(title, category))')
      .order('created_at', { ascending: false })
      .limit(pageLimit)

    if (severity) query = query.eq('severity', severity)
    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })

    // Filter by assessment_id if provided (post-query since it's nested)
    let violations = data || []
    if (assessment_id) {
      violations = violations.filter(v => v.attempts?.assessment_id === assessment_id)
    }

    res.json({ violations })
  } catch (err) {
    console.error('Get violations error:', err)
    res.status(500).json({ error: 'Failed to fetch violations' })
  }
})

// ─── SERVER-SIDE HEARTBEAT MONITOR ──────────────────────────
// Checks for stale heartbeats every 15 seconds
// If attempt has no heartbeat for 30s → log warning
// If no heartbeat for 60s → auto-submit
let heartbeatMonitorInterval = null

export function startHeartbeatMonitor() {
  if (heartbeatMonitorInterval) return
  heartbeatMonitorInterval = setInterval(async () => {
    const now = Date.now()
    for (const [attemptId, state] of liveState) {
      if (state.autoSubmitted) continue
      const elapsed = now - (state.updatedAt || 0)

      if (elapsed > HEARTBEAT_CRITICAL_MS) {
        // Critical: no heartbeat for 60s — auto-submit
        state.autoSubmitted = true
        setLiveState(attemptId, state)
        await serverAutoSubmit(attemptId, 'No heartbeat for 60+ seconds (possible tab close/freeze)')
          .catch(e => console.error('Heartbeat monitor auto-submit error:', e.message))
      } else if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        // Warning: no heartbeat for 30s — log it
        state.missedHeartbeats = (state.missedHeartbeats || 0) + 1
        if (state.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
          state.autoSubmitted = true
          setLiveState(attemptId, state)
          await serverAutoSubmit(attemptId, `Missed ${state.missedHeartbeats} heartbeats`)
            .catch(e => console.error('Heartbeat monitor auto-submit error:', e.message))
        } else {
          try { await supabaseAdmin.from('violations').insert({
            attempt_id: attemptId,
            type: 'heartbeat_timeout',
            details: `No heartbeat for ${Math.round(elapsed / 1000)}s (miss #${state.missedHeartbeats})`,
            severity: 'major',
            source: 'server'
          }) } catch {}
          setLiveState(attemptId, state)
        }
      }
    }
  }, 15_000) // Check every 15 seconds
}

// ─── Helper: Server-side auto-submit ──────────────────────────
async function serverAutoSubmit(attemptId, reason) {
  try {
    const { data: attempt } = await supabaseAdmin
      .from('attempts')
      .select('*, assessments(id, title, category, passing_marks)')
      .eq('id', attemptId)
      .maybeSingle()

    if (!attempt || attempt.status !== 'in_progress') return

    // Fetch questions and grade
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, correct_answer')
      .eq('assessment_id', attempt.assessment_id)

    const savedAnswers = attempt.answers || []
    let score = 0
    const total = questions?.length || 0
    const correctMap = {}
    ;(questions || []).forEach(q => { correctMap[q.id] = q.correct_answer })

    savedAnswers.forEach(ans => {
      if (ans?.question_id && ans?.selected && correctMap[ans.question_id] === ans.selected) {
        score++
      }
    })

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0

    // Get violation count
    let violationCount = 0
    try {
      const { count } = await supabaseAdmin
        .from('violations')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', attemptId)
      violationCount = count || 0
    } catch { violationCount = 0 }

    // Update attempt
    await supabaseAdmin
      .from('attempts')
      .update({
        score,
        total,
        percentage,
        status: 'auto_submitted',
        auto_submitted: true,
        submission_reason: `[SERVER] ${reason}`,
        violation_count: violationCount,
        submitted_at: new Date().toISOString()
      })
      .eq('id', attemptId)

    // End proctoring session
    await supabaseAdmin
      .from('proctoring_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('attempt_id', attemptId)

    // Save result
    const passingMarks = attempt.assessments?.passing_marks || 50
    const resultStatus = percentage >= passingMarks ? 'passed' : 'failed'
    try { await supabaseAdmin.from('results').insert({
      user_id: attempt.user_id,
      assessment_id: attempt.assessment_id,
      assessment_title: attempt.assessments?.title || 'Unknown',
      category: attempt.assessments?.category || 'General',
      score,
      total,
      percentage,
      status: resultStatus,
      duration: ''
    }) } catch {}

    console.log(`🔒 [PROCTOR] Auto-submitted attempt ${attemptId}: ${reason}`)
  } catch (err) {
    console.error('Server auto-submit error:', err)
  }
}

export default router
