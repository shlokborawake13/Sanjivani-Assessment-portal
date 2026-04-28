-- =====================================================
-- Sanjivani Portal — Migration V9: SECURITY FIX
-- RE-ENABLE RLS ON ALL PUBLIC TABLES
--
-- This migration REVERSES migration_v8 which disabled RLS.
-- Supabase flagged two critical issues:
--   1. rls_disabled_in_public — tables publicly accessible
--   2. sensitive_columns_exposed — profiles table has PII
--
-- ARCHITECTURE:
--   - Frontend NEVER queries the DB directly (all via Express API)
--   - Express backend uses supabaseAdmin (service_role key)
--   - service_role BYPASSES RLS entirely, so backend is unaffected
--   - RLS protects against anyone using the anon key / project URL
--
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================

-- ═══════════════════════════════════════════════════════
-- STEP 1: RE-ENABLE RLS ON ALL PUBLIC TABLES
-- ═══════════════════════════════════════════════════════

ALTER TABLE IF EXISTS profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS results               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS questions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS violations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS answer_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS code_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proctoring_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempt_reset_logs    ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════
-- STEP 2: DROP ALL EXISTING POLICIES (clean slate)
-- We drop every known policy to avoid "already exists" errors
-- ═══════════════════════════════════════════════════════

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Service role full access profiles" ON profiles;

-- assessments
DROP POLICY IF EXISTS "Authenticated can read assessments" ON assessments;
DROP POLICY IF EXISTS "Service role full access assessments" ON assessments;

-- results
DROP POLICY IF EXISTS "Users can read own results" ON results;
DROP POLICY IF EXISTS "Users can insert own results" ON results;
DROP POLICY IF EXISTS "Service role full access results" ON results;

-- announcements
DROP POLICY IF EXISTS "Authenticated can read announcements" ON announcements;
DROP POLICY IF EXISTS "Service role full access announcements" ON announcements;

-- support_tickets
DROP POLICY IF EXISTS "Users can read own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can insert own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Service role full access tickets" ON support_tickets;

-- questions
DROP POLICY IF EXISTS "Authenticated can read questions" ON questions;
DROP POLICY IF EXISTS "Service role full access questions" ON questions;

-- attempts
DROP POLICY IF EXISTS "Users can read own attempts" ON attempts;
DROP POLICY IF EXISTS "Users can insert own attempts" ON attempts;
DROP POLICY IF EXISTS "Users can update own attempts" ON attempts;
DROP POLICY IF EXISTS "Service role full access attempts" ON attempts;

-- violations
DROP POLICY IF EXISTS "Service role full access violations" ON violations;

-- answer_logs
DROP POLICY IF EXISTS "Service role full access answer_logs" ON answer_logs;
DROP POLICY IF EXISTS "Users can read own answer_logs" ON answer_logs;

-- code_submissions
DROP POLICY IF EXISTS "Users can read own code submissions" ON code_submissions;
DROP POLICY IF EXISTS "Service role full access code_submissions" ON code_submissions;

-- daily_visits
DROP POLICY IF EXISTS "Users can read own visits" ON daily_visits;
DROP POLICY IF EXISTS "Users can insert own visits" ON daily_visits;
DROP POLICY IF EXISTS "Service role full access visits" ON daily_visits;

-- proctoring_sessions
DROP POLICY IF EXISTS "Service role full access proctoring_sessions" ON proctoring_sessions;
DROP POLICY IF EXISTS "Users can read own proctoring sessions" ON proctoring_sessions;

-- attempt_reset_logs
DROP POLICY IF EXISTS "Service role full access attempt_reset_logs" ON attempt_reset_logs;
DROP POLICY IF EXISTS "Admins can read attempt_reset_logs" ON attempt_reset_logs;


-- ═══════════════════════════════════════════════════════
-- STEP 3: CREATE NEW SECURE POLICIES
--
-- Pattern for every table:
--   1. service_role gets unrestricted ALL access (backend needs this)
--   2. Authenticated users get minimal necessary access
--   3. Anonymous users get NOTHING (no policies = deny all)
-- ═══════════════════════════════════════════════════════

-- ─── PROFILES ───
-- service_role: full CRUD (backend manages all profile operations)
CREATE POLICY "service_role_profiles"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own profile only (protects other users' PII)
CREATE POLICY "users_select_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Authenticated: update own profile only
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Authenticated: insert own profile (for the signup trigger fallback)
CREATE POLICY "users_insert_own_profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);


-- ─── ASSESSMENTS ───
CREATE POLICY "service_role_assessments"
  ON assessments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: can read assessments (needed if any client-side reads exist)
CREATE POLICY "authenticated_select_assessments"
  ON assessments FOR SELECT
  USING (auth.role() = 'authenticated');


-- ─── RESULTS ───
CREATE POLICY "service_role_results"
  ON results FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own results only
CREATE POLICY "users_select_own_results"
  ON results FOR SELECT
  USING (auth.uid() = user_id);


-- ─── ANNOUNCEMENTS ───
CREATE POLICY "service_role_announcements"
  ON announcements FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: can read announcements
CREATE POLICY "authenticated_select_announcements"
  ON announcements FOR SELECT
  USING (auth.role() = 'authenticated');


-- ─── SUPPORT TICKETS ───
CREATE POLICY "service_role_support_tickets"
  ON support_tickets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own tickets only
CREATE POLICY "users_select_own_tickets"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id);


-- ─── QUESTIONS ───
CREATE POLICY "service_role_questions"
  ON questions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: can read questions (needed for exam taking)
CREATE POLICY "authenticated_select_questions"
  ON questions FOR SELECT
  USING (auth.role() = 'authenticated');


-- ─── ATTEMPTS ───
CREATE POLICY "service_role_attempts"
  ON attempts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own attempts
CREATE POLICY "users_select_own_attempts"
  ON attempts FOR SELECT
  USING (auth.uid() = user_id);


-- ─── VIOLATIONS ───
CREATE POLICY "service_role_violations"
  ON violations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
-- No user-facing policies — violations are server-managed only


-- ─── ANSWER LOGS ───
CREATE POLICY "service_role_answer_logs"
  ON answer_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
-- No user-facing policies — answer logs are server-managed only


-- ─── CODE SUBMISSIONS ───
CREATE POLICY "service_role_code_submissions"
  ON code_submissions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own code submissions
CREATE POLICY "users_select_own_code_submissions"
  ON code_submissions FOR SELECT
  USING (auth.uid() = user_id);


-- ─── DAILY VISITS ───
CREATE POLICY "service_role_daily_visits"
  ON daily_visits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own visit records
CREATE POLICY "users_select_own_visits"
  ON daily_visits FOR SELECT
  USING (auth.uid() = user_id);


-- ─── PROCTORING SESSIONS ───
CREATE POLICY "service_role_proctoring_sessions"
  ON proctoring_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated: read own proctoring sessions
CREATE POLICY "users_select_own_proctoring"
  ON proctoring_sessions FOR SELECT
  USING (auth.uid() = user_id);


-- ─── ATTEMPT RESET LOGS ───
CREATE POLICY "service_role_attempt_reset_logs"
  ON attempt_reset_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
-- No user-facing policies — admin-only table, accessed via service_role


-- ═══════════════════════════════════════════════════════
-- STEP 4: FORCE RLS FOR TABLE OWNERS (EXTRA SECURITY)
-- By default, table owners bypass RLS. FORCE ensures even
-- the table owner must satisfy policies (defense in depth).
-- service_role still bypasses because Supabase grants it
-- the 'supabase_admin' role with BYPASSRLS privilege.
-- ═══════════════════════════════════════════════════════

ALTER TABLE IF EXISTS profiles              FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessments           FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS results               FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS announcements         FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets       FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS questions             FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempts              FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS violations            FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS answer_logs           FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS code_submissions      FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_visits          FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proctoring_sessions   FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempt_reset_logs    FORCE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════
-- STEP 5: REVOKE DIRECT TABLE ACCESS FOR ANON ROLE
-- Even with RLS, revoke direct access for the anonymous
-- API role as an extra layer of defense. This ensures
-- unauthenticated users can't query tables at all.
-- ═══════════════════════════════════════════════════════

REVOKE ALL ON profiles             FROM anon;
REVOKE ALL ON assessments          FROM anon;
REVOKE ALL ON results              FROM anon;
REVOKE ALL ON announcements        FROM anon;
REVOKE ALL ON support_tickets      FROM anon;
REVOKE ALL ON questions            FROM anon;
REVOKE ALL ON attempts             FROM anon;
REVOKE ALL ON violations           FROM anon;
REVOKE ALL ON answer_logs          FROM anon;
REVOKE ALL ON code_submissions     FROM anon;
REVOKE ALL ON daily_visits         FROM anon;
REVOKE ALL ON proctoring_sessions  FROM anon;
REVOKE ALL ON attempt_reset_logs   FROM anon;


-- ═══════════════════════════════════════════════════════
-- STEP 6: VERIFICATION QUERIES
-- Run these after the migration to confirm everything worked
-- ═══════════════════════════════════════════════════════

-- 6a. Confirm RLS is ENABLED on all tables (all should be true)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'assessments', 'results', 'announcements',
    'support_tickets', 'questions', 'attempts', 'violations',
    'daily_visits', 'answer_logs', 'code_submissions',
    'proctoring_sessions', 'attempt_reset_logs'
  )
ORDER BY tablename;

-- 6b. List all active policies (should see service_role + user policies)
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
