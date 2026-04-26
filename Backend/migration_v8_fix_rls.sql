-- =====================================================
-- Sanjivani Portal — Migration V8
-- COMPLETE RLS FIX: Disable RLS on ALL public tables
-- 
-- WHY: All database access goes through the Express backend
-- which uses supabaseAdmin (service_role key). RLS is not
-- needed and actively blocks operations like:
--   - Admin creating announcements
--   - Admin viewing student attempts
--   - Server-side streak/checkin updates
--
-- Run this in Supabase Dashboard → SQL Editor
-- =====================================================

-- ─── 1. Core tables ───
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS results DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets DISABLE ROW LEVEL SECURITY;

-- ─── 2. Assessment/exam tables ───
ALTER TABLE IF EXISTS questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS violations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS answer_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS code_submissions DISABLE ROW LEVEL SECURITY;

-- ─── 3. Engagement tables ───
ALTER TABLE IF EXISTS daily_visits DISABLE ROW LEVEL SECURITY;

-- ─── 4. Proctoring tables ───
ALTER TABLE IF EXISTS proctoring_sessions DISABLE ROW LEVEL SECURITY;

-- ─── 5. Admin tables ───
ALTER TABLE IF EXISTS attempt_reset_logs DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFICATION: Confirm RLS is disabled on all tables
-- All rows should show rowsecurity = false
-- =====================================================
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
