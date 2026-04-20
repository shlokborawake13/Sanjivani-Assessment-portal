-- ═══════════════════════════════════════════════════════
-- Fix user roles in the profiles table
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. First, see all current roles:
SELECT id, name, email, role FROM profiles ORDER BY name;

-- 2. Set Shlok as admin (update the name/email to match exactly):
UPDATE profiles SET role = 'admin' WHERE name ILIKE '%shlok%' OR email ILIKE '%shlok%';

-- 3. Set Arnav as manager:
UPDATE profiles SET role = 'manager' WHERE name ILIKE '%arnav%' OR email ILIKE '%arnav%';

-- 4. Verify the changes:
SELECT id, name, email, role FROM profiles ORDER BY role, name;
