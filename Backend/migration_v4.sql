-- =====================================================
-- Sanjivani Portal — Migration V4
-- Secure Aptitude Assessment: Answer Logs, Speed Flags
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Per-question answer tracking table
CREATE TABLE IF NOT EXISTS answer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  selected_option TEXT,
  time_taken INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);

-- 2. Add per-question timer column to assessments
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS per_question_time INTEGER DEFAULT 0;

-- 3. Add speed-flag columns to attempts
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS speed_flagged BOOLEAN DEFAULT false;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS avg_time_per_question NUMERIC(6,2) DEFAULT 0;

-- 4. Add shuffled_order to attempts (stores the server-side shuffled question IDs)
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS shuffled_order JSONB DEFAULT '[]';

-- 5. Add option_map to attempts (stores per-question shuffled option mappings)
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS option_map JSONB DEFAULT '{}';

-- 6. RLS for answer_logs
ALTER TABLE answer_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access answer_logs" ON answer_logs
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can read own answer_logs" ON answer_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM attempts WHERE attempts.id = answer_logs.attempt_id AND attempts.user_id = auth.uid()
    )
  );

-- 7. Add question_type column if missing (needed for question filtering)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'mcq';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'Intermediate';
