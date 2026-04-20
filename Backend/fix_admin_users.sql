-- ============================================================
-- FIX: Ensure admin can read ALL users from profiles table
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Check if RLS is enabled on profiles (for debugging)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'profiles';

-- 2. Drop the policy if it already exists to prevent duplicate errors
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;

-- 3. Create the policy for full read access
CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT
  USING (true);

-- 4. Verify all profiles are accessible
SELECT COUNT(*) as total_users FROM public.profiles;
SELECT role, COUNT(*) as count FROM public.profiles GROUP BY role;
