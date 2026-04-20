import { supabaseAdmin } from '../config/supabase.js'

/**
 * Authentication middleware.
 * Extracts JWT from Authorization header, verifies it via Supabase,
 * and attaches user + profile to req.user.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }

    const token = authHeader.split(' ')[1]

    // Verify JWT with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Fetch the user's profile (includes role)
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    // Auto-create profile only if it truly doesn't exist (never overwrite existing role)
    if (profileError || !profile) {
      const meta = user.user_metadata || {}
      const newProfile = {
        id: user.id,
        name: meta.name || user.email.split('@')[0],
        email: user.email,
        prn: meta.prn || null,
        phone: meta.phone || null,
        department: meta.department || null,
        year: meta.year || null,
        division: meta.division || null,
        role: 'student'
      }

      const { data: created, error: createErr } = await supabaseAdmin
        .from('profiles')
        .insert(newProfile)
        .select()
        .maybeSingle()

      if (!createErr && created) {
        profile = created
      } else {
        // Row already exists (race condition) — re-fetch it
        const { data: refetched } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()
        profile = refetched || newProfile
      }
    }

    req.user = { ...user, id: user.id, profile }
    req.token = token
    next()
  } catch (err) {
    console.error('Auth middleware error:', err)
    res.status(500).json({ error: 'Authentication failed' })
  }
}
