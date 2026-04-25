-- =====================================================
-- Sanjivani Portal — Migration V7
-- Secure Assessment System: Proctoring, Assessment Types,
-- Topics, Audio/Face Monitoring, Server-side Enforcement
-- Run this in Supabase SQL Editor
-- =====================================================

-- ─── 1. Questions: Add topic column for topic-based browsing ───
ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT DEFAULT 'General';

-- ─── 2. Assessments: Assessment type (4 types) ───
-- We use a TEXT column with a CHECK constraint for the 4 assessment types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessments' AND column_name = 'assessment_type'
  ) THEN
    ALTER TABLE assessments ADD COLUMN assessment_type TEXT DEFAULT 'aptitude';
  END IF;
END $$;

-- ─── 3. Assessments: Proctoring configuration per exam ───
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS require_camera BOOLEAN DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS require_mic BOOLEAN DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_violations INTEGER DEFAULT 3;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS violation_auto_submit BOOLEAN DEFAULT true;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS min_screen_width INTEGER DEFAULT 1024;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS min_screen_height INTEGER DEFAULT 768;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS proctoring_strictness TEXT DEFAULT 'standard'
  CHECK (proctoring_strictness IN ('relaxed', 'standard', 'strict'));

-- ─── 4. Violations: Add severity and more fields ───
ALTER TABLE violations ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'minor';
ALTER TABLE violations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'client';
-- source: 'client' = frontend-detected, 'server' = server-detected (e.g. heartbeat timeout)

-- ─── 5. Proctoring sessions — server-side state tracking ───
CREATE TABLE IF NOT EXISTS proctoring_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Device info (validated server-side)
  screen_width INTEGER DEFAULT 0,
  screen_height INTEGER DEFAULT 0,
  user_agent TEXT DEFAULT '',
  -- Real-time state (updated by heartbeat)
  camera_active BOOLEAN DEFAULT false,
  mic_active BOOLEAN DEFAULT false,
  fullscreen_active BOOLEAN DEFAULT true,
  face_detected BOOLEAN DEFAULT true,
  face_count INTEGER DEFAULT 1,
  audio_level FLOAT DEFAULT 0,
  -- Heartbeat tracking
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  heartbeat_count INTEGER DEFAULT 0,
  missed_heartbeats INTEGER DEFAULT 0,
  -- Flags
  is_suspicious BOOLEAN DEFAULT false,
  suspicious_reasons JSONB DEFAULT '[]',
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ─── 6. Attempts: Track proctoring state ───
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS proctoring_session_id UUID;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS screen_width INTEGER DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS screen_height INTEGER DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT '';
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS speed_flagged BOOLEAN DEFAULT false;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS submission_reason TEXT;

-- ─── 7. RLS for proctoring_sessions ───
ALTER TABLE proctoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access proctoring_sessions" ON proctoring_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own proctoring sessions" ON proctoring_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- ─── 8. Indexes for performance ───
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_assessment_topic ON questions(assessment_id, topic);
CREATE INDEX IF NOT EXISTS idx_assessments_type ON assessments(assessment_type);
CREATE INDEX IF NOT EXISTS idx_violations_attempt ON violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations(severity);
CREATE INDEX IF NOT EXISTS idx_proctoring_attempt ON proctoring_sessions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_proctoring_heartbeat ON proctoring_sessions(last_heartbeat);

-- ─── 9. Update existing assessment categories to assessment_type ───
-- Map existing categories to assessment types for backwards compatibility
UPDATE assessments SET assessment_type = 'aptitude'
  WHERE assessment_type IS NULL AND (
    lower(category) LIKE '%aptitude%' OR lower(category) LIKE '%general%'
  );
UPDATE assessments SET assessment_type = 'coding'
  WHERE assessment_type IS NULL AND lower(category) LIKE '%coding%';
UPDATE assessments SET assessment_type = 'communication'
  WHERE assessment_type IS NULL AND lower(category) LIKE '%communication%';
UPDATE assessments SET assessment_type = 'technical_reasoning'
  WHERE assessment_type IS NULL AND (
    lower(category) LIKE '%technical%' OR lower(category) LIKE '%reasoning%'
  );
-- Default remaining to aptitude
UPDATE assessments SET assessment_type = 'aptitude'
  WHERE assessment_type IS NULL;
