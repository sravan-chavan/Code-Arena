/**
 * Milestone 10 — per test-case points.
 *
 * Default is 10. The backend calculates question and contest totals from
 * SUM(question_test_cases.points). Existing rows receive the default.
 */

module.exports = {
  id: '012',
  name: 'test_case_points',
  up: `
    ALTER TABLE question_test_cases
      ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 10;

    ALTER TABLE question_test_cases
      DROP CONSTRAINT IF EXISTS question_test_cases_points_check;

    ALTER TABLE question_test_cases
      ADD CONSTRAINT question_test_cases_points_check CHECK (points >= 1);
  `,
  down: `
    ALTER TABLE question_test_cases
      DROP CONSTRAINT IF EXISTS question_test_cases_points_check;

    ALTER TABLE question_test_cases
      DROP COLUMN IF EXISTS points;
  `,
};
