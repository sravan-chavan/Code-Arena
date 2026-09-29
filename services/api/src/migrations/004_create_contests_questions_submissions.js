/**
 * Contests, questions, test cases, and submissions for the E2E execution slice.
 *
 * UUID PKs via gen_random_uuid(), matching users. Status/difficulty use CHECK
 * constraints (not ENUMs) so later additions stay ordinary migrations.
 */

module.exports = {
  id: '004',
  name: 'create_contests_questions_submissions',
  up: `
    CREATE TABLE IF NOT EXISTS contests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'running',
      start_time TIMESTAMPTZ,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      created_by UUID NOT NULL REFERENCES users(id),
      is_development_seed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT contests_title_present_check
        CHECK (title <> '' AND title = btrim(title)),
      CONSTRAINT contests_status_check
        CHECK (status IN ('draft', 'scheduled', 'running', 'ended')),
      CONSTRAINT contests_duration_check
        CHECK (duration_minutes > 0)
    );

    CREATE INDEX IF NOT EXISTS contests_status_idx ON contests (status);
    CREATE INDEX IF NOT EXISTS contests_created_at_idx ON contests (created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS contests_dev_seed_title_idx
      ON contests (title)
      WHERE is_development_seed = TRUE;

    CREATE TABLE IF NOT EXISTS questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      input_format TEXT NOT NULL DEFAULT '',
      output_format TEXT NOT NULL DEFAULT '',
      constraints_text TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT 'easy',
      time_limit_seconds INTEGER NOT NULL DEFAULT 2,
      memory_limit_mb INTEGER NOT NULL DEFAULT 128,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT questions_title_present_check
        CHECK (title <> '' AND title = btrim(title)),
      CONSTRAINT questions_difficulty_check
        CHECK (difficulty IN ('easy', 'medium', 'hard')),
      CONSTRAINT questions_time_limit_check
        CHECK (time_limit_seconds > 0),
      CONSTRAINT questions_memory_limit_check
        CHECK (memory_limit_mb > 0)
    );

    CREATE INDEX IF NOT EXISTS questions_contest_sort_idx
      ON questions (contest_id, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS question_test_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      stdin TEXT NOT NULL DEFAULT '',
      expected_output TEXT NOT NULL DEFAULT '',
      is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS question_test_cases_question_sort_idx
      ON question_test_cases (question_id, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      language_slug TEXT NOT NULL,
      language_id INTEGER NOT NULL,
      source_code TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      stdout TEXT,
      stderr TEXT,
      compile_output TEXT,
      message TEXT,
      exit_code INTEGER,
      execution_time TEXT,
      memory_kb INTEGER,
      judge0_token TEXT,
      tests_passed INTEGER,
      tests_total INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT submissions_kind_check
        CHECK (kind IN ('run', 'submit')),
      CONSTRAINT submissions_status_check
        CHECK (status IN (
          'QUEUED',
          'RUNNING',
          'ACCEPTED',
          'WRONG_ANSWER',
          'TIME_LIMIT_EXCEEDED',
          'COMPILATION_ERROR',
          'RUNTIME_ERROR',
          'INTERNAL_ERROR'
        )),
      CONSTRAINT submissions_language_id_check
        CHECK (language_id > 0)
    );

    CREATE INDEX IF NOT EXISTS submissions_user_created_idx
      ON submissions (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS submissions_question_created_idx
      ON submissions (question_id, created_at DESC);
  `,
  down: `
    DROP TABLE IF EXISTS submissions;
    DROP TABLE IF EXISTS question_test_cases;
    DROP TABLE IF EXISTS questions;
    DROP TABLE IF EXISTS contests;
  `,
};
