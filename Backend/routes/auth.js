import { Router } from 'express'
import multer from 'multer'
import { supabaseAdmin, supabaseUrl } from '../config/supabase.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../config/mailer.js'

const router = Router()

// Multer config — memory storage for Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'), false)
    }
  }
})

// POST /api/auth/register — Student self-registration (with email verification)
router.post('/register', upload.single('profilePhoto'), async (req, res) => {
  try {
    const { email, password, name, prn, phone, department, year, division } = req.body

    // ── Validation ──────────────────────────────────────
    const errors = {}
    if (!name || name.trim().length < 2) errors.name = 'Full name is required (min 2 characters)'
    if (!prn || prn.trim().length < 3) errors.prn = 'PRN is required'
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid email is required'
    if (!phone || !/^\d{10}$/.test(phone)) errors.phone = 'A valid 10-digit phone number is required'
    if (!department) errors.department = 'Department is required'
    if (!year) errors.year = 'Year is required'
    if (!division) errors.division = 'Division is required'
    if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters'

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', errors })
    }

    // ── Check for duplicate PRN ─────────────────────────
    const { data: existingPrn } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('prn', prn.trim())
      .maybeSingle()

    if (existingPrn) {
      return res.status(409).json({ error: 'An account with this PRN already exists' })
    }

    // ── Check for duplicate email ───────────────────────
    const { data: existingEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    // ── Step 1: Create auth user (email NOT auto-confirmed) ──
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: false,  // Require email verification
      user_metadata: { name: name.trim(), prn: prn.trim(), department }
    })

    if (authError) {
      console.error('Auth createUser error:', authError)
      return res.status(400).json({ error: authError.message })
    }

    if (!authData.user) {
      return res.status(400).json({ error: 'Registration failed — no user created' })
    }

    const userId = authData.user.id

    // ── Step 2: Upload profile photo (if provided) ──────
    let profileUrl = null
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop().toLowerCase()
      const filePath = `${userId}/profile.${fileExt}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from('profiles')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        })

      if (uploadError) {
        console.error('Photo upload error:', uploadError)
      } else {
        const { data: urlData } = supabaseAdmin.storage
          .from('profiles')
          .getPublicUrl(filePath)
        profileUrl = urlData?.publicUrl || null
      }
    }

    // ── Step 3: Insert profile row ──────────────────────
    const profileData = {
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      prn: prn.trim(),
      phone: phone.trim(),
      department,
      year,
      division: division.trim(),
      section: division.trim(), // section = division for target audience filtering
      profile_url: profileUrl,
      role: 'student'
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert(profileData)

    if (profileError) {
      console.error('Profile insert error:', profileError)
      // Attempt upsert as fallback
      await supabaseAdmin.from('profiles').upsert(profileData)
    }

    // ── Step 4: Generate verification link & send via nodemailer ──
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        redirectTo: `${frontendUrl}/login?verified=true`
      }
    })

    let emailSent = false
    if (linkError) {
      console.error('Generate verification link error:', linkError)
    } else {
      // linkData.properties.action_link contains the confirmation URL
      const confirmationUrl = linkData?.properties?.action_link
      if (confirmationUrl) {
        console.log(`🔗 Verification link generated for ${email}`)
        emailSent = await sendVerificationEmail(
          email.trim().toLowerCase(),
          confirmationUrl,
          name.trim()
        )
      } else {
        console.error('❌ No action_link in generateLink response')
      }
    }

    // ── Return success — user must verify email before login ──
    res.status(201).json({
      message: emailSent 
        ? 'Account created! Please check your email to verify your account before logging in.'
        : 'Account created! Verification email could not be sent — please contact support or use the resend option.',
      requiresVerification: true,
      emailSent
    })
  } catch (err) {
    console.error('Register error:', err)
    if (err.message?.includes('Only JPG')) {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

// POST /api/auth/resend-verification — Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        redirectTo: `${frontendUrl}/login?verified=true`
      }
    })

    if (linkError) {
      console.error('Resend verification link error:', linkError)
      return res.status(400).json({ error: 'Failed to generate verification link' })
    }

    const confirmationUrl = linkData?.properties?.action_link
    if (!confirmationUrl) {
      return res.status(400).json({ error: 'Failed to generate verification link' })
    }

    // Lookup user name for the email template
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    const emailSent = await sendVerificationEmail(
      email.trim().toLowerCase(),
      confirmationUrl,
      profile?.name || ''
    )

    if (emailSent) {
      res.json({ message: 'Verification email sent! Please check your inbox (also check spam folder).' })
    } else {
      res.status(500).json({ error: 'Failed to send verification email — SMTP may not be configured' })
    }
  } catch (err) {
    console.error('Resend verification error:', err)
    res.status(500).json({ error: 'Failed to resend verification email' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    })

    if (error) {
      // Check if the error is about email not confirmed
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        return res.status(403).json({ 
          error: 'Please verify your email before logging in. Check your inbox for the verification link.',
          requiresVerification: true,
          email: email.trim().toLowerCase()
        })
      }
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Fetch profile with role
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle()

    // If profile doesn't exist, create it from auth metadata
    if (profileError || !profile) {
      const meta = data.user.user_metadata || {}
      const newProfile = {
        id: data.user.id,
        name: meta.name || data.user.email.split('@')[0],
        email: data.user.email,
        prn: meta.prn || null,
        department: meta.department || null,
        phone: meta.phone || null,
        year: meta.year || null,
        division: meta.division || null,
        role: 'student'
      }

      // Use INSERT (not upsert!) so we never overwrite an existing profile's role
      const { data: created, error: createErr } = await supabaseAdmin
        .from('profiles')
        .insert(newProfile)
        .select()
        .maybeSingle()

      if (createErr) {
        // Profile likely already exists (conflict) — re-fetch it
        const { data: existing } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle()

        profile = existing || newProfile
      } else {
        profile = created || newProfile
      }
    }

    res.json({
      user: profile,
      session: data.session
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

// GET /api/auth/me — Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    const token = authHeader.split(' ')[1]
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    res.json({ user: profile })
  } catch (err) {
    console.error('Get me error:', err)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

// POST /api/auth/forgot-password — Send password reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check if user exists in profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (!profile) {
      // Don't reveal if email exists — always return success
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' })
    }

    // Generate password recovery link via Supabase
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo: `${frontendUrl}/reset-password`
      }
    })

    if (linkError) {
      console.error('Generate recovery link error:', linkError)
      return res.status(500).json({ error: 'Failed to generate reset link' })
    }

    // ─── Build a DIRECT link to the frontend reset-password page ───
    // Instead of using Supabase's action_link (which goes through Supabase's
    // auth server and requires /reset-password to be in the Redirect URLs
    // whitelist), we extract the token from the link response and construct
    // a direct link to our frontend with the token as a query parameter.
    // This completely bypasses Supabase's redirect URL verification.
    
    // The generateLink response contains the user's access tokens we can use
    const actionLink = linkData?.properties?.action_link
    const hashedToken = linkData?.properties?.hashed_token

    // Try to extract access token from action_link or use hashed_token
    let resetUrl
    if (hashedToken) {
      // Build direct frontend link with hashed_token
      resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(hashedToken)}&type=recovery`
    } else if (actionLink) {
      // Fallback: parse the action_link to extract token and build direct link
      try {
        const actionUrl = new URL(actionLink)
        const token = actionUrl.searchParams.get('token')
        if (token) {
          resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}&type=recovery`
        } else {
          // Last fallback — use action_link directly (may fail if redirect URL not whitelisted)
          resetUrl = actionLink
        }
      } catch {
        resetUrl = actionLink
      }
    }

    if (!resetUrl) {
      console.error('❌ No action_link or hashed_token in recovery generateLink response')
      return res.status(500).json({ error: 'Failed to generate reset link' })
    }

    console.log(`🔗 Password reset link generated for ${normalizedEmail}`)

    // Send the email via nodemailer
    const emailSent = await sendPasswordResetEmail(
      normalizedEmail,
      resetUrl,
      profile.name || ''
    )

    if (emailSent) {
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' })
    } else {
      res.status(500).json({ error: 'Failed to send reset email — SMTP may not be configured' })
    }
  } catch (err) {
    console.error('Forgot password error:', err)
    res.status(500).json({ error: 'Failed to process password reset request' })
  }
})

// POST /api/auth/reset-password — Reset password using token
router.post('/reset-password', async (req, res) => {
  try {
    const { access_token, token_hash, new_password } = req.body

    if (!access_token && !token_hash) {
      return res.status(400).json({ error: 'Reset token is required' })
    }
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' })
    }

    let userId = null

    // Method 1: Verify via hashed_token (OTP-style — from generateLink)
    if (token_hash) {
      const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        token_hash,
        type: 'recovery'
      })

      if (verifyError || !verifyData?.user) {
        console.error('OTP verification failed:', verifyError?.message)
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' })
      }
      userId = verifyData.user.id
    }
    // Method 2: Verify via access_token (JWT-style — legacy/hash fragment flow)
    else if (access_token) {
      const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(access_token)

      if (verifyError || !user) {
        console.error('Reset token verification failed:', verifyError?.message)
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' })
      }
      userId = user.id
    }

    if (!userId) {
      return res.status(400).json({ error: 'Could not verify reset token' })
    }

    // Update password via admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: new_password
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      return res.status(500).json({ error: 'Failed to update password' })
    }

    console.log(`✅ Password reset successful for user ${userId}`)
    res.json({ message: 'Password reset successful! You can now login with your new password.' })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

export default router
