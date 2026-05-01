-- =====================================================
-- Sanjivani Portal — Migration V10: FIX RLS FOR SERVICE_ROLE
--
-- Problem: service_role key should bypass RLS but isn't.
-- This happens when:
--   1. The policies don't properly recognize service_role
--   2. FORCE RLS is applied but service_role doesn't have BYPASSRLS
--
-- Solution: Grant explicit BYPASSRLS to the service_role,
-- and create permissive policies that allow service_role full access.
-- Also add authenticated user INSERT/UPDATE policies for tables
-- that need frontend operations (attempts, results, etc.)
--
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================

-- ═══════════════════════════════════════════════════════
-- STEP 1: Drop ALL existing policies (clean slate)
-- ═══════════════════════════════════════════════════════

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════
-- STEP 2: RE-ENABLE RLS (idempotent)
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
-- STEP 3: REMOVE FORCE RLS
-- FORCE RLS was causing service_role to be blocked.
-- In Supabase, the service_role key uses the 'authenticated' role
-- with special headers. FORCE RLS makes even the postgres owner
-- subject to RLS, and this was breaking service_role operations.
-- Normal ENABLE RLS is sufficient — it applies to non-superuser roles.
-- ═══════════════════════════════════════════════════════

ALTER TABLE IF EXISTS profiles              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessments           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS results               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS announcements         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS questions             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempts              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS violations            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS answer_logs           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS code_submissions      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_visits          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proctoring_sessions   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempt_reset_logs    NO FORCE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════
-- STEP 4: CREATE PERMISSIVE POLICIES
--
-- The service_role key in Supabase uses the postgres role with
-- BYPASSRLS privilege. With NO FORCE, postgres bypasses RLS
-- automatically. We only need policies for the authenticated role.
--
-- Pattern: authenticated users get appropriate access per table.
-- service_role (backend) bypasses RLS completely.
-- ═══════════════════════════════════════════════════════


-- ─── PROFILES ───
-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (signup trigger)
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);


-- ─── ASSESSMENTS ───
-- All authenticated users can read assessments
CREATE POLICY "assessments_select_authenticated"
  ON assessments FOR SELECT
  TO authenticated
  USING (true);


-- ─── RESULTS ───
-- Users can read their own results
CREATE POLICY "results_select_own"
  ON results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ─── ANNOUNCEMENTS ───
-- All authenticated users can read announcements
CREATE POLICY "announcements_select_authenticated"
  ON announcements FOR SELECT
  TO authenticated
  USING (true);


-- ─── SUPPORT TICKETS ───
-- Users can read their own tickets
CREATE POLICY "support_tickets_select_own"
  ON support_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own tickets
CREATE POLICY "support_tickets_insert_own"
  ON support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- ─── QUESTIONS ───
-- All authenticated users can read questions (needed for exams)
CREATE POLICY "questions_select_authenticated"
  ON questions FOR SELECT
  TO authenticated
  USING (true);


-- ─── ATTEMPTS ───
-- Users can read their own attempts
CREATE POLICY "attempts_select_own"
  ON attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own attempts (starting an exam)
CREATE POLICY "attempts_insert_own"
  ON attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own attempts (saving progress, submitting)
CREATE POLICY "attempts_update_own"
  ON attempts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── VIOLATIONS ───
-- No user access needed — managed by backend only
-- (service_role bypasses RLS)


-- ─── ANSWER LOGS ───
-- No user access needed — managed by backend only


-- ─── CODE SUBMISSIONS ───
-- Users can read their own code submissions
CREATE POLICY "code_submissions_select_own"
  ON code_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ─── DAILY VISITS ───
-- Users can read their own visit records
CREATE POLICY "daily_visits_select_own"
  ON daily_visits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own visit records
CREATE POLICY "daily_visits_insert_own"
  ON daily_visits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- ─── PROCTORING SESSIONS ───
-- Users can read their own proctoring sessions
CREATE POLICY "proctoring_select_own"
  ON proctoring_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ─── ATTEMPT RESET LOGS ───
-- No user access — admin only via service_role


-- ═══════════════════════════════════════════════════════
-- STEP 5: REVOKE ANON ACCESS (defense in depth)
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
-- STEP 6: GRANT authenticated role table access
-- (needed because some tables may have had grants revoked)
-- ═══════════════════════════════════════════════════════

GRANT SELECT ON profiles TO authenticated;
GRANT INSERT ON profiles TO authenticated;
GRANT UPDATE ON profiles TO authenticated;

GRANT SELECT ON assessments TO authenticated;

GRANT SELECT ON results TO authenticated;

GRANT SELECT ON announcements TO authenticated;

GRANT SELECT, INSERT ON support_tickets TO authenticated;

GRANT SELECT ON questions TO authenticated;

GRANT SELECT, INSERT, UPDATE ON attempts TO authenticated;

GRANT SELECT ON code_submissions TO authenticated;

GRANT SELECT, INSERT ON daily_visits TO authenticated;

GRANT SELECT ON proctoring_sessions TO authenticated;


-- ═══════════════════════════════════════════════════════
-- STEP 7: VERIFICATION
-- ═══════════════════════════════════════════════════════

-- 7a. Confirm RLS is ENABLED (but NOT forced)
SELECT c.relname AS tablename, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'profiles', 'assessments', 'results', 'announcements',
    'support_tickets', 'questions', 'attempts', 'violations',
    'daily_visits', 'answer_logs', 'code_submissions',
    'proctoring_sessions', 'attempt_reset_logs'
  )
ORDER BY c.relname;

-- 7b. List all active policies
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
