-- =====================================================
-- Sanjivani Portal - Registration Schema Update
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Drop the broken trigger (if not already done)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 2. Add new columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS year TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_url TEXT;

-- 3. Add UNIQUE constraint on PRN (prevent duplicate accounts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_prn_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_prn_key UNIQUE (prn);
  END IF;
END $$;

-- 4. Add UNIQUE constraint on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
  END IF;
END $$;

-- 5. Drop old RLS policies and recreate clean ones
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service role full access profiles" ON profiles;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (for registration)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Service role has full access (for backend operations)
CREATE POLICY "Service role full access profiles"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Create storage bucket for profile photos (run separately if needed)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiles',
  'profiles',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 7. Storage policies for profile photos
DROP POLICY IF EXISTS "Anyone can view profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own photo" ON storage.objects;
DROP POLICY IF EXISTS "Service role storage access" ON storage.objects;

CREATE POLICY "Anyone can view profile photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profiles');

CREATE POLICY "Users can upload own photo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profiles');

CREATE POLICY "Users can update own photo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profiles');

CREATE POLICY "Service role storage access"
  ON storage.objects FOR ALL
  USING (auth.role() = 'service_role');
