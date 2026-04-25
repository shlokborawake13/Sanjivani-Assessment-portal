-- ============================================================================
-- Migration: Fix RLS policies for questions and related tables
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- The 'questions' table is ONLY accessed through the backend server 
-- which uses the service_role key. Since service_role should bypass RLS,
-- but some Supabase configurations enforce it anyway, we disable RLS
-- on tables that are exclusively managed server-side.

-- Fix 1: Disable RLS on questions table (server-managed only)
ALTER TABLE IF EXISTS questions DISABLE ROW LEVEL SECURITY;

-- Fix 2: Disable RLS on violations table (server-managed only)
ALTER TABLE IF EXISTS violations DISABLE ROW LEVEL SECURITY;

-- Fix 3: Disable RLS on attempts table (server-managed only)
ALTER TABLE IF EXISTS attempts DISABLE ROW LEVEL SECURITY;

-- Fix 4: Disable RLS on results table (server-managed only)
ALTER TABLE IF EXISTS results DISABLE ROW LEVEL SECURITY;

-- Fix 5: Disable RLS on proctoring_sessions table (server-managed only)  
ALTER TABLE IF EXISTS proctoring_sessions DISABLE ROW LEVEL SECURITY;

-- Fix 6: Disable RLS on attempt_reset_logs table (server-managed only)
ALTER TABLE IF EXISTS attempt_reset_logs DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Verify: Check that RLS is disabled
-- ============================================================================
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('questions', 'violations', 'attempts', 'results', 'proctoring_sessions', 'attempt_reset_logs');
