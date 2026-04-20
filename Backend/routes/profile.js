import { Router } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Only JPG, PNG, and WebP images are allowed'), false)
  }
})

router.use(authenticate)

// GET /api/profile — Get own profile
router.get('/', async (req, res) => {
  res.json({ user: req.user.profile })
})

// PUT /api/profile — Update own profile (only department, year, division, photo allowed after registration)
router.put('/', upload.single('profilePhoto'), async (req, res) => {
  try {
    const { department, year, division } = req.body
    const updates = { updated_at: new Date().toISOString() }

    // Only allow updating department, year, division after registration
    // Name, PRN, phone, email are locked once the account is created
    if (department !== undefined) updates.department = department
    if (year !== undefined) updates.year = year
    if (division !== undefined) updates.division = division.trim()

    // Handle photo upload
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop().toLowerCase()
      const filePath = `${req.user.id}/profile.${fileExt}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from('profiles')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        })

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage
          .from('profiles')
          .getPublicUrl(filePath)
        updates.profile_url = urlData?.publicUrl || null
      }
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .maybeSingle()

    if (error) {
      return res.status(400).json({ error: error.message })
    }
    if (!data) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    res.json({ user: data })
  } catch (err) {
    console.error('Profile update error:', err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// DELETE /api/profile — Delete own account
router.delete('/', async (req, res) => {
  try {
    // Delete profile photo from storage
    const { data: files } = await supabaseAdmin.storage
      .from('profiles')
      .list(req.user.id)

    if (files && files.length > 0) {
      const filePaths = files.map(f => `${req.user.id}/${f.name}`)
      await supabaseAdmin.storage.from('profiles').remove(filePaths)
    }

    // Delete auth user (cascade deletes profile)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.user.id)
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    res.json({ message: 'Account deleted successfully' })
  } catch (err) {
    console.error('Profile delete error:', err)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

export default router
