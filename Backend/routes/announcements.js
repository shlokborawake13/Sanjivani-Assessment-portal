import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { roleGuard } from '../middleware/roleGuard.js'

const router = Router()
router.use(authenticate)

// GET /api/announcements — List all announcements (any authenticated user)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })
    res.json({ announcements: data })
  } catch (err) {
    console.error('List announcements error:', err)
    res.status(500).json({ error: 'Failed to fetch announcements' })
  }
})

// POST /api/announcements — Create announcement (admin/manager only)
router.post('/', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { title, message, type } = req.body
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' })
    }

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        title,
        message,
        type: type || 'info',
        created_by: req.user.id
      })
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(500).json({ error: 'Failed to create announcement' })
    res.status(201).json({ announcement: data })
  } catch (err) {
    console.error('Create announcement error:', err)
    res.status(500).json({ error: 'Failed to create announcement' })
  }
})

// PUT /api/announcements/:id — Update announcement (admin/manager only)
router.put('/:id', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { title, message, type } = req.body
    const updates = {}
    if (title !== undefined) updates.title = title
    if (message !== undefined) updates.message = message
    if (type !== undefined) updates.type = type

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle()

    if (error) return res.status(400).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Announcement not found' })
    res.json({ announcement: data })
  } catch (err) {
    console.error('Update announcement error:', err)
    res.status(500).json({ error: 'Failed to update announcement' })
  }
})

// DELETE /api/announcements/:id — Delete announcement (admin/manager)
router.delete('/:id', roleGuard('admin', 'manager'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', req.params.id)

    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Announcement deleted' })
  } catch (err) {
    console.error('Delete announcement error:', err)
    res.status(500).json({ error: 'Failed to delete announcement' })
  }
})

export default router
