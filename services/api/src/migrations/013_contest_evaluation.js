/**
 * Milestone 10 — contest evaluation, sessions, scoring, violations.
 *
 * Reuses submissions (practice + contest) and contest_participants.
 * Question membership remains contest_questions (no questions.contest_id).
 * Invalidation is participant+contest+question, never global.
 */

module.exports = {
  id: '013',
  name: 'contest_evaluation',
  up: `
    ALTER TABLE contest_participants
      DROP CONSTRAINT IF EXISTS contest_participants_status_check;

    ALTER TABLE contest_participants
      ADD CONSTRAINT contest_participants_status_check
      CHECK (status IN ('registered', 'started', 'completed', 'removed', 'exited'));

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS effective_deadline TIMESTAMPTZ;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS current_question_id UUID REFERENCES questions(id) ON DELETE SET NULL;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS tab_switch_count INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS last_tab_switch_at TIMESTAMPTZ;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS penalty INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS possible_score INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS solved_count INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS last_scoring_at TIMESTAMPTZ;

    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES contest_participants(id) ON DELETE SET NULL;

    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS submissions_contest_created_idx
      ON submissions (contest_id, created_at DESC)
      WHERE contest_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS submissions_participant_created_idx
      ON submissions (participant_id, created_at DESC)
      WHERE participant_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS submissions_contest_question_idx
      ON submissions (contest_id, question_id, created_at DESC)
      WHERE contest_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS submission_test_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      test_case_id UUID REFERENCES question_test_cases(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL,
      passed BOOLEAN NOT NULL DEFAULT FALSE,
      points INTEGER NOT NULL DEFAULT 0,
      points_earned INTEGER NOT NULL DEFAULT 0,
      execution_time TEXT,
      memory_kb INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS submission_test_results_submission_idx
      ON submission_test_results (submission_id, sort_order);

    CREATE TABLE IF NOT EXISTS participant_question_states (
      contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      participant_id UUID NOT NULL REFERENCES contest_participants(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      invalidated BOOLEAN NOT NULL DEFAULT FALSE,
      invalidation_reason TEXT,
      invalidated_at TIMESTAMPTZ,
      earned_points INTEGER NOT NULL DEFAULT 0,
      possible_points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contest_id, participant_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS participant_question_states_participant_idx
      ON participant_question_states (participant_id);

    CREATE TABLE IF NOT EXISTS contest_violations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      participant_id UUID NOT NULL REFERENCES contest_participants(id) ON DELETE CASCADE,
      question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 1,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT contest_violations_type_check CHECK (type IN ('TAB_SWITCH'))
    );

    CREATE INDEX IF NOT EXISTS contest_violations_participant_idx
      ON contest_violations (participant_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS contest_violations_contest_idx
      ON contest_violations (contest_id, occurred_at DESC);
  `,
  down: `
    DROP TABLE IF EXISTS contest_violations;
    DROP TABLE IF EXISTS participant_question_states;
    DROP TABLE IF EXISTS submission_test_results;

    DROP INDEX IF EXISTS submissions_contest_question_idx;
    DROP INDEX IF EXISTS submissions_participant_created_idx;
    DROP INDEX IF EXISTS submissions_contest_created_idx;

    ALTER TABLE submissions DROP COLUMN IF EXISTS evaluated_at;
    ALTER TABLE submissions DROP COLUMN IF EXISTS score;
    ALTER TABLE submissions DROP COLUMN IF EXISTS participant_id;

    ALTER TABLE contest_participants DROP COLUMN IF EXISTS last_scoring_at;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS solved_count;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS possible_score;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS penalty;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS score;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS last_tab_switch_at;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS tab_switch_count;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS current_question_id;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS effective_deadline;

    ALTER TABLE contest_participants
      DROP CONSTRAINT IF EXISTS contest_participants_status_check;

    ALTER TABLE contest_participants
      ADD CONSTRAINT contest_participants_status_check
      CHECK (status IN ('registered', 'started', 'completed'));
  `,
};
