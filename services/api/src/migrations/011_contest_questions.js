/**
 * Many-to-many contest membership (M9).
 *
 * contest_questions is the source of truth for which contests a question
 * belongs to and for contest-specific sort_order. Existing questions.contest_id
 * rows are copied, then contest_id is dropped so membership cannot diverge.
 *
 * Practice rows (is_practice TRUE) are not copied. Unassigned library rows
 * (no contest_id) also receive no junction rows.
 *
 * Does not duplicate question records.
 */

module.exports = {
  id: '011',
  name: 'contest_questions',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS contest_questions (
        contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (contest_id, question_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS contest_questions_question_idx
        ON contest_questions (question_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS contest_questions_contest_sort_idx
        ON contest_questions (contest_id, sort_order, created_at)
    `);

    await client.query(`
      INSERT INTO contest_questions (contest_id, question_id, sort_order, created_at, updated_at)
      SELECT q.contest_id, q.id, q.sort_order, q.created_at, q.updated_at
      FROM questions q
      WHERE q.contest_id IS NOT NULL
        AND q.is_practice = FALSE
      ON CONFLICT (contest_id, question_id) DO NOTHING
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION contest_questions_reject_practice()
      RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM questions WHERE id = NEW.question_id AND is_practice = TRUE
        ) THEN
          RAISE EXCEPTION 'Practice questions cannot be attached to a contest.'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS contest_questions_reject_practice_trg ON contest_questions
    `);
    await client.query(`
      CREATE TRIGGER contest_questions_reject_practice_trg
      BEFORE INSERT OR UPDATE OF question_id ON contest_questions
      FOR EACH ROW
      EXECUTE FUNCTION contest_questions_reject_practice()
    `);

    await client.query(`
      ALTER TABLE questions
        DROP CONSTRAINT IF EXISTS questions_practice_contest_check
    `);
    await client.query(`
      DROP INDEX IF EXISTS questions_unassigned_idx
    `);
    await client.query(`
      DROP INDEX IF EXISTS questions_contest_sort_idx
    `);
    await client.query(`
      ALTER TABLE questions
        DROP COLUMN IF EXISTS contest_id
    `);
  },
  down: `
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS contest_id UUID REFERENCES contests(id) ON DELETE CASCADE;

    UPDATE questions q
    SET contest_id = sub.contest_id,
        sort_order = sub.sort_order
    FROM (
      SELECT DISTINCT ON (question_id)
        question_id, contest_id, sort_order
      FROM contest_questions
      ORDER BY question_id, sort_order ASC, created_at ASC
    ) sub
    WHERE q.id = sub.question_id;

    DROP TRIGGER IF EXISTS contest_questions_reject_practice_trg ON contest_questions;
    DROP FUNCTION IF EXISTS contest_questions_reject_practice();
    DROP TABLE IF EXISTS contest_questions;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_practice_contest_check;
    ALTER TABLE questions
      ADD CONSTRAINT questions_practice_contest_check
      CHECK (is_practice = FALSE OR contest_id IS NULL);

    CREATE INDEX IF NOT EXISTS questions_contest_sort_idx
      ON questions (contest_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS questions_unassigned_idx
      ON questions (created_at DESC)
      WHERE contest_id IS NULL AND is_practice = FALSE;
  `,
};
