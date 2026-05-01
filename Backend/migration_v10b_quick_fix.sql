-- ═══════════════════════════════════════════════════════════════
-- MIGRATION V10b — QUICK FIX: Remove FORCE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════
-- This is a simplified, error-proof version.
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Remove FORCE from all tables (this is the critical fix)
-- NO FORCE = service_role key can bypass RLS as intended
ALTER TABLE IF EXISTS profiles              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessments           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS results               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS announcements         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS questions             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempts              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS violations            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS answer_logs           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_visits          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS code_submissions      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proctoring_sessions   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempt_reset_logs    NO FORCE ROW LEVEL SECURITY;

-- STEP 2: Ensure RLS is still ENABLED (standard, not forced)
ALTER TABLE IF EXISTS profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assessments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS results               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS questions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS violations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS answer_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS code_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS proctoring_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attempt_reset_logs    ENABLE ROW LEVEL SECURITY;

-- STEP 3: Verify — run this after to confirm
SELECT 
  c.relname AS table_name, 
  c.relrowsecurity AS rls_enabled, 
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
