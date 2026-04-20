import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)

// In-memory store for real-time presence (no DB writes needed)
// Format: { [userId]: { name, department, role, profile_url, last_seen: Date } }
const onlineUsers = new Map()

// Clean up stale entries every 60 seconds
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 1000 // 2 minutes
  for (const [id, data] of onlineUsers) {
    if (data.last_seen < cutoff) {
      onlineUsers.delete(id)
    }
  }
}, 60 * 1000)

// POST /api/activity/heartbeat — Called every 30s by all logged-in users
router.post('/heartbeat', (req, res) => {
  const profile = req.user.profile
  onlineUsers.set(req.user.id, {
    id: req.user.id,
    name: profile.name,
    email: profile.email,
    department: profile.department,
    role: profile.role,
    prn: profile.prn,
    profile_url: profile.profile_url || profile.avatar_url || null,
    last_seen: Date.now()
  })
  res.json({ ok: true })
})

// GET /api/activity/online — Get currently online users (admin/manager only)
router.get('/online', roleGuard('admin', 'manager'), (req, res) => {
  const cutoff = Date.now() - 2 * 60 * 1000 // Active in last 2 minutes
  const active = []

  for (const [id, data] of onlineUsers) {
    if (data.last_seen >= cutoff) {
      active.push({
        id,
        name: data.name,
        email: data.email,
        department: data.department,
        role: data.role,
        prn: data.prn,
        profile_url: data.profile_url,
        active_since: new Date(data.last_seen).toISOString()
      })
    }
  }

  // Sort students first, then by name
  active.sort((a, b) => {
    if (a.role === 'student' && b.role !== 'student') return -1
    if (a.role !== 'student' && b.role === 'student') return 1
    return (a.name || '').localeCompare(b.name || '')
  })

  res.json({
    total: active.length,
    students: active.filter(u => u.role === 'student').length,
    managers: active.filter(u => u.role === 'manager').length,
    admins: active.filter(u => u.role === 'admin').length,
    users: active
  })
})

export default router
