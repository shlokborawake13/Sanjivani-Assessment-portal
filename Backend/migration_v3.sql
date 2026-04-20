-- =====================================================
-- Sanjivani Portal — Migration V3
-- Streak Tracking, Leaderboard, Questions, Attempts, Violations
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add streak/engagement columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_problems_solved INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aptitude_score NUMERIC(5,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coding_score NUMERIC(5,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS communication_score NUMERIC(5,2) DEFAULT 0;

-- 2. Questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_answer TEXT NOT NULL,
  explanation TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Attempts table
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  answers JSONB DEFAULT '[]',
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  percentage INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'auto_submitted')),
  submission_reason TEXT,
  strict_mode_enabled BOOLEAN DEFAULT true,
  warnings_log JSONB DEFAULT '[]',
  violation_count INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Violations table
CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Daily visits tracking table
CREATE TABLE IF NOT EXISTS daily_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, visit_date)
);

-- 6. Add question_count column to assessments
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS question_count INTEGER DEFAULT 0;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Practice';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'Beginner, Intermediate, Advanced';

-- 7. RLS for new tables
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_visits ENABLE ROW LEVEL SECURITY;

-- Questions: authenticated can read, service_role full access
CREATE POLICY "Authenticated can read questions" ON questions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role full access questions" ON questions FOR ALL USING (auth.role() = 'service_role');

-- Attempts: users can read own, service_role full access
CREATE POLICY "Users can read own attempts" ON attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own attempts" ON attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own attempts" ON attempts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access attempts" ON attempts FOR ALL USING (auth.role() = 'service_role');

-- Violations: service_role full access
CREATE POLICY "Service role full access violations" ON violations FOR ALL USING (auth.role() = 'service_role');

-- Daily visits: users can manage own, service_role full access
CREATE POLICY "Users can read own visits" ON daily_visits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own visits" ON daily_visits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access visits" ON daily_visits FOR ALL USING (auth.role() = 'service_role');
