import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)

// POST /api/support — Submit support ticket (always uses profile data for student info)
router.post('/', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) {
      return res.status(400).json({ error: 'Message is required' })
    }

    // Always use the authenticated user's profile info — prevents spoofing
    const profile = req.user.profile
    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: req.user.id,
        name: profile.name || 'Unknown',
        email: profile.email || '',
        prn: profile.prn || '',
        department: profile.department || '',
        message
      })
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(500).json({ error: 'Failed to create ticket' })
    res.status(201).json({ ticket: data })
  } catch (err) {
    console.error('Submit ticket error:', err)
    res.status(500).json({ error: 'Failed to submit ticket' })
  }
})

// GET /api/support — Get tickets (own for student, all for admin/manager)
router.get('/', async (req, res) => {
  try {
    const role = req.user.profile.role
    let query = supabaseAdmin
      .from('support_tickets')
      .select('*, profiles(role, year, division, phone, profile_url)')
      .order('created_at', { ascending: false })

    if (role === 'student') {
      query = query.eq('user_id', req.user.id)
    }

    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })
    // Flatten profile data into ticket
    const tickets = (data || []).map(t => ({
      ...t,
      user_role: t.profiles?.role || 'student',
      year: t.profiles?.year || null,
      division: t.profiles?.division || null,
      phone: t.profiles?.phone || null,
      profile_url: t.profiles?.profile_url || null,
      profiles: undefined
    }))
    res.json({ tickets })
  } catch (err) {
    console.error('Get tickets error:', err)
    res.status(500).json({ error: 'Failed to fetch tickets' })
  }
})

// PUT /api/support/:id — Update ticket status (admin/manager only)
router.put('/:id', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { status } = req.body
    if (!status) {
      return res.status(400).json({ error: 'Status is required' })
    }

    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Ticket not found' })
    res.json({ ticket: data })
  } catch (err) {
    console.error('Update ticket error:', err)
    res.status(500).json({ error: 'Failed to update ticket' })
  }
})

export default router
