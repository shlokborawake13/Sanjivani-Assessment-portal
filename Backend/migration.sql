-- =====================================================
-- Sanjivani Assessment Portal — Database Migration
-- Run this in Supabase SQL Editor (supabase.com → SQL)
-- =====================================================

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  prn TEXT,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'manager', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Assessments table
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  duration TEXT DEFAULT '60 min',
  questions INTEGER DEFAULT 0,
  difficulty TEXT DEFAULT 'Intermediate',
  status TEXT DEFAULT 'available',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Results table
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
  assessment_title TEXT NOT NULL,
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  duration TEXT DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('important', 'info', 'update')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  prn TEXT,
  department TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read own, service_role can do anything
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access profiles" ON profiles FOR ALL USING (auth.role() = 'service_role');

-- Assessments: all authenticated can read
CREATE POLICY "Authenticated can read assessments" ON assessments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role full access assessments" ON assessments FOR ALL USING (auth.role() = 'service_role');

-- Results: users can read own, insert own
CREATE POLICY "Users can read own results" ON results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own results" ON results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access results" ON results FOR ALL USING (auth.role() = 'service_role');

-- Announcements: all authenticated can read
CREATE POLICY "Authenticated can read announcements" ON announcements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role full access announcements" ON announcements FOR ALL USING (auth.role() = 'service_role');

-- Support tickets: users can read own, insert own
CREATE POLICY "Users can read own tickets" ON support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tickets" ON support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access tickets" ON support_tickets FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- Trigger: Auto-create profile on signup
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    'student'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- Add unique constraint on assessments title for upsert
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_title_key'
  ) THEN
    ALTER TABLE assessments ADD CONSTRAINT assessments_title_key UNIQUE (title);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_title_key'
  ) THEN
    ALTER TABLE announcements ADD CONSTRAINT announcements_title_key UNIQUE (title);
  END IF;
END $$;