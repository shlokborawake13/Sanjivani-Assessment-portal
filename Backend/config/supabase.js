import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

// Admin client — bypasses RLS, used for server-side DB operations
// IMPORTANT: Do NOT call auth.getUser() on this client — it contaminates the session
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Separate client ONLY for JWT verification (auth.getUser)
// This prevents the admin client's service_role from being downgraded
// when verifying user tokens
export const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Create a user-scoped client from a JWT token
export function createUserClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  })
}

export { supabaseUrl, supabaseAnonKey }

