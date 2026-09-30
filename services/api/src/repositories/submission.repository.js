const { query, queryOne } = require('../db/query');

function iso(value) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function mapTestResult(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    submissionId: row.submission_id,
    testCaseId: row.test_case_id,
    sortOrder: Number(row.sort_order || 0),
    isHidden: Boolean(row.is_hidden),
    status: row.status,
    passed: Boolean(row.passed),
    points: Number(row.points || 0),
    pointsEarned: Number(row.points_earned || 0),
    executionTime: row.execution_time,
    memoryKb: row.memory_kb,
  };
}

function mapSubmission(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    contestId: row.contest_id,
    participantId: row.participant_id || null,
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
    score: row.score === undefined || row.score === null ? 0 : Number(row.score),
    evaluatedAt: iso(row.evaluated_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    testResults: Array.isArray(row.testResults) ? row.testResults : undefined,
  };
}

function toPublic(submission, { includeHiddenResults = false } = {}) {
  if (!submission) {
    return null;
  }
  const { sourceCode, ...rest } = submission;
  if (Array.isArray(rest.testResults) && !includeHiddenResults) {
    rest.testResults = rest.testResults
      .filter((row) => !row.isHidden)
      .map((row) => ({
        id: row.id,
        sortOrder: row.sortOrder,
        isHidden: false,
        status: row.status,
        passed: row.passed,
        points: row.points,
        pointsEarned: row.pointsEarned,
        executionTime: row.executionTime,
        memoryKb: row.memoryKb,
      }));
  }
  return rest;
}

function toAdmin(submission) {
  if (!submission) {
    return null;
  }
  const { sourceCode, ...rest } = submission;
  return rest;
}

async function create(input, client) {
  const row = await queryOne(
    `INSERT INTO submissions (
       user_id, contest_id, participant_id, question_id, language_slug, language_id,
       source_code, kind, status, tests_total
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED', $9)
     RETURNING *`,
    [
      input.userId,
      input.contestId,
      input.participantId || null,
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

async function listByContestAndUser(contestId, userId, client) {
  const result = await query(
    `SELECT * FROM submissions
     WHERE contest_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [contestId, userId],
    client,
  );
  return result.rows.map(mapSubmission);
}

async function listByContest(contestId, client) {
  const result = await query(
    `SELECT * FROM submissions
     WHERE contest_id = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [contestId],
    client,
  );
  return result.rows.map(mapSubmission);
}

async function listContestSubmitsForParticipant(contestId, participantId, client) {
  const result = await query(
    `SELECT * FROM submissions
     WHERE contest_id = $1 AND participant_id = $2 AND kind = 'submit'
     ORDER BY created_at ASC`,
    [contestId, participantId],
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
       score = COALESCE($13, score),
       evaluated_at = NOW(),
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
      result.score ?? 0,
    ],
    client,
  );
  return mapSubmission(row);
}

async function replaceTestResults(submissionId, results, client) {
  await query('DELETE FROM submission_test_results WHERE submission_id = $1', [submissionId], client);
  const stored = [];
  for (const result of results || []) {
    const row = await queryOne(
      `INSERT INTO submission_test_results (
         submission_id, test_case_id, sort_order, is_hidden, status, passed,
         points, points_earned, execution_time, memory_kb
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        submissionId,
        result.testCaseId || null,
        result.sortOrder || 0,
        Boolean(result.isHidden),
        result.status,
        Boolean(result.passed),
        Number(result.points || 0),
        Number(result.pointsEarned || 0),
        result.time ?? result.executionTime ?? null,
        result.memory ?? result.memoryKb ?? null,
      ],
      client,
    );
    stored.push(mapTestResult(row));
  }
  return stored;
}

async function listTestResults(submissionId, client) {
  const result = await query(
    `SELECT * FROM submission_test_results
     WHERE submission_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [submissionId],
    client,
  );
  return result.rows.map(mapTestResult);
}

async function attachTestResults(submission, client) {
  if (!submission) {
    return null;
  }
  const testResults = await listTestResults(submission.id, client);
  return { ...submission, testResults };
}

module.exports = {
  mapSubmission,
  mapTestResult,
  toPublic,
  toAdmin,
  create,
  findById,
  listByUser,
  listByUserPractice,
  listByContestAndUser,
  listByContest,
  listContestSubmitsForParticipant,
  applyResult,
  replaceTestResults,
  listTestResults,
  attachTestResults,
};
