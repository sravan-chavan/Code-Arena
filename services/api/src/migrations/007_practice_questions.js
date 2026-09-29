/**
 * Practice problems reuse the questions table without a contest.
 *
 * contest_id becomes nullable. is_practice XOR contest membership is enforced
 * so a row is either a contest question or a practice problem, never both.
 * Practice submissions keep contest_id NULL on the existing submissions table.
 */

module.exports = {
  id: '007',
  name: 'practice_questions',
  up: `
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS is_development_seed BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE questions
      ALTER COLUMN contest_id DROP NOT NULL;

    ALTER TABLE submissions
      ALTER COLUMN contest_id DROP NOT NULL;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_practice_xor_contest_check;

    ALTER TABLE questions
      ADD CONSTRAINT questions_practice_xor_contest_check
      CHECK (
        (is_practice = TRUE AND contest_id IS NULL)
        OR (is_practice = FALSE AND contest_id IS NOT NULL)
      );

    CREATE UNIQUE INDEX IF NOT EXISTS questions_practice_dev_seed_title_idx
      ON questions (title)
      WHERE is_practice = TRUE AND is_development_seed = TRUE;
  `,
  down: `
    DELETE FROM submissions WHERE contest_id IS NULL;
    DELETE FROM questions WHERE is_practice = TRUE;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_practice_xor_contest_check;

    DROP INDEX IF EXISTS questions_practice_dev_seed_title_idx;

    ALTER TABLE submissions
      ALTER COLUMN contest_id SET NOT NULL;

    ALTER TABLE questions
      ALTER COLUMN contest_id SET NOT NULL;

    ALTER TABLE questions
      DROP COLUMN IF EXISTS is_development_seed;

    ALTER TABLE questions
      DROP COLUMN IF EXISTS is_practice;
  `,
};
