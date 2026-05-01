import { supabaseAdmin, supabaseAuth } from '../config/supabase.js'

// ─── In-memory profile cache (30s TTL) ───
// Eliminates 1 DB call per request for recently authenticated users
const profileCache = new Map()
const CACHE_TTL = 30_000 // 30 seconds

function getCachedProfile(userId) {
  const entry = profileCache.get(userId)
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return entry.profile
  }
  profileCache.delete(userId)
  return null
}

function setCachedProfile(userId, profile) {
  profileCache.set(userId, { profile, timestamp: Date.now() })
  // Prevent unbounded cache growth — evict old entries periodically
  if (profileCache.size > 500) {
    const now = Date.now()
    for (const [key, val] of profileCache) {
      if (now - val.timestamp > CACHE_TTL) profileCache.delete(key)
    }
  }
}

/**
 * Authentication middleware.
 * Extracts JWT from Authorization header, verifies it via Supabase,
 * and attaches user + profile to req.user.
 * 
 * IMPORTANT: Uses supabaseAuth (not supabaseAdmin) for getUser() to
 * prevent contaminating the admin client's service_role session.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }

    const token = authHeader.split(' ')[1]

    // Verify JWT with dedicated auth client (NOT supabaseAdmin!)
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Check profile cache first
    let profile = getCachedProfile(user.id)
    
    if (!profile) {
      // Fetch the user's profile (includes role)
      const { data: fetchedProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      // Auto-create profile only if it truly doesn't exist (never overwrite existing role)
      if (profileError || !fetchedProfile) {
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
      } else {
        profile = fetchedProfile
      }

      // Cache the profile
      setCachedProfile(user.id, profile)
    }

    req.user = { ...user, id: user.id, profile }
    req.token = token
    next()
  } catch (err) {
    console.error('Auth middleware error:', err)
    res.status(500).json({ error: 'Authentication failed' })
  }
}
