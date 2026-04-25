-- =====================================================
-- Sanjivani Portal — Migration V5
-- Secure Coding Assessment: Code Submissions Table
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Code submissions table — tracks each code submission per problem
CREATE TABLE IF NOT EXISTS code_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'javascript',
  passed_tests INTEGER DEFAULT 0,
  total_tests INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  time_taken INTEGER DEFAULT 0,
  speed_flagged BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'partial', 'failed', 'error')),
  execution_results JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add code_template to questions if not exists
ALTER TABLE questions ADD COLUMN IF NOT EXISTS code_template TEXT DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS test_cases JSONB DEFAULT '[]';

-- 3. RLS
ALTER TABLE code_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own code submissions" ON code_submissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access code_submissions" ON code_submissions
  FOR ALL USING (auth.role() = 'service_role');
