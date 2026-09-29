const { query, queryOne } = require('../db/query');

function mapSubmission(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    contestId: row.contest_id,
    questionId: row.question_id,
    languageSlug: row.language_slug,
    languageId: row.language_id,
    sourceCode: row.source_code,
    kind: row.kind,
    status: row.status,
    stdout: row.stdout,
    stderr: row.stderr,
    compileOutput: row.compile_output,
    message: row.message,
    exitCode: row.exit_code,
    executionTime: row.execution_time,
    memoryKb: row.memory_kb,
    judge0Token: row.judge0_token,
    testsPassed: row.tests_passed,
    testsTotal: row.tests_total,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function toPublic(submission) {
  if (!submission) {
    return null;
  }
  const { sourceCode, ...rest } = submission;
  return rest;
}

async function create(input, client) {
  const row = await queryOne(
    `INSERT INTO submissions (
       user_id, contest_id, question_id, language_slug, language_id,
       source_code, kind, status, tests_total
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'QUEUED', $8)
     RETURNING *`,
    [
      input.userId,
      input.contestId,
      input.questionId,
      input.languageSlug,
      input.languageId,
      input.sourceCode,
      input.kind,
      input.testsTotal || 0,
    ],
    client,
  );
  return mapSubmission(row);
}

async function findById(id, client) {
  const row = await queryOne('SELECT * FROM submissions WHERE id = $1', [id], client);
  return mapSubmission(row);
}

async function listByUser(userId, client) {
  const result = await query(
    `SELECT * FROM submissions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId],
    client,
  );
  return result.rows.map(mapSubmission);
}

async function listByUserPractice(userId, client) {
  const result = await query(
    `SELECT s.*
     FROM submissions s
     INNER JOIN questions q ON q.id = s.question_id
     WHERE s.user_id = $1 AND q.is_practice = TRUE
     ORDER BY s.created_at DESC
     LIMIT 100`,
    [userId],
    client,
  );
  return result.rows.map(mapSubmission);
}

async function applyResult(id, result, client) {
  const row = await queryOne(
    `UPDATE submissions SET
       status = $2,
       stdout = $3,
       stderr = $4,
       compile_output = $5,
       message = $6,
       exit_code = $7,
       execution_time = $8,
       memory_kb = $9,
       judge0_token = $10,
       tests_passed = $11,
       tests_total = COALESCE($12, tests_total),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      result.status,
      result.stdout ?? null,
      result.stderr ?? null,
      result.compileOutput ?? null,
      result.message ?? null,
      result.exitCode ?? null,
      result.time ?? null,
      result.memory ?? null,
      result.token ?? null,
      result.testsPassed ?? null,
      result.testsTotal ?? null,
    ],
    client,
  );
  return mapSubmission(row);
}

module.exports = {
  mapSubmission,
  toPublic,
  create,
  findById,
  listByUser,
  listByUserPractice,
  applyResult,
};
