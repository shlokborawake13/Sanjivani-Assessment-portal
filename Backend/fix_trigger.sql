-- =====================================================
-- FIX: Remove the problematic trigger entirely
-- Profile creation will be handled by the backend
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function
DROP FUNCTION IF EXISTS handle_new_user();
