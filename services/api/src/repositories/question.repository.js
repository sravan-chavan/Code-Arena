const { query, queryOne } = require('../db/query');

function mapQuestion(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    contestId: row.contest_id,
    contestTitle: row.contest_title,
    title: row.title,
    description: row.description,
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    constraints: row.constraints_text,
    difficulty: row.difficulty,
    timeLimitSeconds: row.time_limit_seconds,
    memoryLimitMb: row.memory_limit_mb,
    sortOrder: row.sort_order,
    isPractice: Boolean(row.is_practice),
    isDevelopmentSeed: Boolean(row.is_development_seed),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapTestCase(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    questionId: row.question_id,
    stdin: row.stdin,
    expectedOutput: row.expected_output,
    isHidden: row.is_hidden,
    sortOrder: row.sort_order,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function create(input, client) {
  const row = await queryOne(
    `INSERT INTO questions (
       contest_id, title, description, input_format, output_format, constraints_text,
       difficulty, time_limit_seconds, memory_limit_mb, sort_order
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.contestId,
      input.title,
      input.description || '',
      input.inputFormat || '',
      input.outputFormat || '',
      input.constraints || '',
      input.difficulty || 'easy',
      input.timeLimitSeconds || 2,
      input.memoryLimitMb || 128,
      input.sortOrder || 0,
    ],
    client,
  );
  return mapQuestion(row);
}

async function createPractice(input, client) {
  const row = await queryOne(
    `INSERT INTO questions (
       contest_id, title, description, input_format, output_format, constraints_text,
       difficulty, time_limit_seconds, memory_limit_mb, sort_order,
       is_practice, is_development_seed
     )
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
     RETURNING *`,
    [
      input.title,
      input.description || '',
      input.inputFormat || '',
      input.outputFormat || '',
      input.constraints || '',
      input.difficulty || 'easy',
      input.timeLimitSeconds || 2,
      input.memoryLimitMb || 128,
      input.sortOrder || 0,
      Boolean(input.isDevelopmentSeed),
    ],
    client,
  );
  return mapQuestion(row);
}

async function findById(id, client) {
  const row = await queryOne(
    `SELECT q.*, c.title AS contest_title
     FROM questions q
     LEFT JOIN contests c ON c.id = q.contest_id
     WHERE q.id = $1`,
    [id],
    client,
  );
  return mapQuestion(row);
}

async function listByContestId(contestId, client) {
  const result = await query(
    `SELECT q.*, c.title AS contest_title
     FROM questions q
     JOIN contests c ON c.id = q.contest_id
     WHERE q.contest_id = $1
     ORDER BY q.sort_order ASC, q.created_at ASC`,
    [contestId],
    client,
  );
  return result.rows.map(mapQuestion);
}

async function listAll(client) {
  const result = await query(
    `SELECT q.*, c.title AS contest_title
     FROM questions q
     JOIN contests c ON c.id = q.contest_id
     WHERE q.is_practice = FALSE
     ORDER BY q.created_at DESC`,
    [],
    client,
  );
  return result.rows.map(mapQuestion);
}

async function listPractice(client) {
  const result = await query(
    `SELECT q.*, NULL::text AS contest_title
     FROM questions q
     WHERE q.is_practice = TRUE
     ORDER BY q.sort_order ASC, q.created_at ASC`,
    [],
    client,
  );
  return result.rows.map(mapQuestion);
}

async function findPracticeDevelopmentSeedByTitle(title, client) {
  const row = await queryOne(
    `SELECT q.*, NULL::text AS contest_title
     FROM questions q
     WHERE q.is_practice = TRUE
       AND q.is_development_seed = TRUE
       AND q.title = $1
     LIMIT 1`,
    [title],
    client,
  );
  return mapQuestion(row);
}

async function nextPracticeSortOrder(client) {
  const row = await queryOne(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM questions
     WHERE is_practice = TRUE`,
    [],
    client,
  );
  return Number(row.next_order);
}

async function nextSortOrder(contestId, client) {
  const row = await queryOne(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM questions
     WHERE contest_id = $1`,
    [contestId],
    client,
  );
  return Number(row.next_order);
}

async function createTestCase(input, client) {
  const row = await queryOne(
    `INSERT INTO question_test_cases (question_id, stdin, expected_output, is_hidden, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.questionId,
      input.stdin || '',
      input.expectedOutput || '',
      Boolean(input.isHidden),
      input.sortOrder || 0,
    ],
    client,
  );
  return mapTestCase(row);
}

async function listTestCases(questionId, client) {
  const result = await query(
    `SELECT * FROM question_test_cases
     WHERE question_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [questionId],
    client,
  );
  return result.rows.map(mapTestCase);
}

module.exports = {
  mapQuestion,
  mapTestCase,
  create,
  createPractice,
  findById,
  listByContestId,
  listAll,
  listPractice,
  findPracticeDevelopmentSeedByTitle,
  nextSortOrder,
  nextPracticeSortOrder,
  createTestCase,
  listTestCases,
};
