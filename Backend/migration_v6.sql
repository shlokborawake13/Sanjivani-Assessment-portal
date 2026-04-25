-- =====================================================
-- Sanjivani Portal — Migration V6
-- Assessment System Overhaul: Scheduling, Target Audience,
-- Attempt Lifecycle, Admin Reset, Profile Fields
-- Run this in Supabase SQL Editor
-- =====================================================

-- ─── 1. Profile: Add year and section (mandatory for students) ───
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS year TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS section TEXT;
-- Keep existing 'division' column as alias — new code uses 'section'
-- If division has data, copy it to section:
UPDATE profiles SET section = division WHERE section IS NULL AND division IS NOT NULL;

-- ─── 2. Assessments: Scheduling columns ───
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS late_entry_minutes INTEGER DEFAULT 0;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS allow_late_entry BOOLEAN DEFAULT false;

-- ─── 3. Assessments: Exam configuration ───
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS passing_marks INTEGER DEFAULT 0;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS total_marks INTEGER DEFAULT 0;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS instructions TEXT DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'non_proctored';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;

-- ─── 4. Assessments: Behavior controls ───
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT true;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT true;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS show_results_immediately BOOLEAN DEFAULT true;

-- ─── 5. Assessments: Target audience filtering ───
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS target_departments JSONB DEFAULT '[]';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS target_years JSONB DEFAULT '[]';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS target_sections JSONB DEFAULT '[]';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS open_to_all BOOLEAN DEFAULT true;

-- ─── 6. Attempts: Lifecycle columns ───
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT false;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS invalidated BOOLEAN DEFAULT false;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS invalidated_by UUID;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS invalidated_reason TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ;

-- Update status constraint to include new states
-- First drop the old constraint if it exists
DO $$
BEGIN
  ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_status_check;
  ALTER TABLE attempts ADD CONSTRAINT attempts_status_check
    CHECK (status IN ('not_started', 'in_progress', 'submitted', 'auto_submitted', 'evaluated'));
EXCEPTION WHEN OTHERS THEN
  -- constraint might not exist or might have different name
  NULL;
END $$;

-- ─── 7. Attempt Reset Logs table ───
CREATE TABLE IF NOT EXISTS attempt_reset_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  exam_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'reset' CHECK (action IN ('reset', 'invalidate')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 8. RLS for attempt_reset_logs ───
ALTER TABLE attempt_reset_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access attempt_reset_logs" ON attempt_reset_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins can read attempt_reset_logs" ON attempt_reset_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ─── 9. Index for faster attempt lookups ───
CREATE INDEX IF NOT EXISTS idx_attempts_user_assessment ON attempts(user_id, assessment_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_invalidated ON attempts(invalidated);
