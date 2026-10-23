const { query, queryOne } = require('../db/query');

function parseContests(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item && item.id);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.id) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapQuestion(row) {
  if (!row) {
    return null;
  }
  const contests = parseContests(row.contests);
  const sortOrder = row.contest_sort_order !== undefined && row.contest_sort_order !== null
    ? Number(row.contest_sort_order)
    : row.sort_order;
  return {
    id: row.id,
    contestId: row.membership_contest_id || null,
    contests,
    contestTitle: contests.length === 1 ? contests[0].title : (row.contest_title || null),
    title: row.title,
    description: row.description,
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    constraints: row.constraints_text,
    difficulty: row.difficulty,
    timeLimitSeconds: row.time_limit_seconds,
    memoryLimitMb: row.memory_limit_mb,
    sortOrder,
    isPractice: Boolean(row.is_practice),
    isDevelopmentSeed: Boolean(row.is_development_seed),
    archived: row.archived_at != null,
    archivedAt: row.archived_at instanceof Date
      ? row.archived_at.toISOString()
      : (row.archived_at || null),
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
    points: row.points === undefined || row.points === null ? 10 : Number(row.points),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const CONTEST_AGG = `
  COALESCE((
    SELECT json_agg(json_build_object('id', c.id, 'title', c.title) ORDER BY c.title)
    FROM contest_questions cq
    JOIN contests c ON c.id = cq.contest_id
    WHERE cq.question_id = q.id
  ), '[]'::json) AS contests
`;

async function questionsHaveContestIdColumn(client) {
  const row = await queryOne(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'questions'
       AND column_name = 'contest_id'`,
    [],
    client,
  );
  return Boolean(row);
}

async function testCasesHavePointsColumn(client) {
  const row = await queryOne(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'question_test_cases'
       AND column_name = 'points'`,
    [],
    client,
  );
  return Boolean(row);
}

async function create(input, client) {
  const hasContestId = await questionsHaveContestIdColumn(client);
  if (hasContestId) {
    const row = await queryOne(
      `INSERT INTO questions (
         contest_id, title, description, input_format, output_format, constraints_text,
         difficulty, time_limit_seconds, memory_limit_mb, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.contestId || null,
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

  const row = await queryOne(
    `INSERT INTO questions (
       title, description, input_format, output_format, constraints_text,
       difficulty, time_limit_seconds, memory_limit_mb, sort_order
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    ],
    client,
  );
  return mapQuestion(row);
}

async function createPractice(input, client) {
  const row = await queryOne(
    `INSERT INTO questions (
       title, description, input_format, output_format, constraints_text,
       difficulty, time_limit_seconds, memory_limit_mb, sort_order,
       is_practice, is_development_seed
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
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
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
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
  const row = await queryOne(
    `SELECT q.*, ${CONTEST_AGG}
     FROM questions q
     WHERE q.id = $1`,
    [id],
    client,
  );
  return mapQuestion(row);
}

async function listByContestId(contestId, client) {
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
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
  const result = await query(
    `SELECT q.*, cq.sort_order AS contest_sort_order, cq.contest_id AS membership_contest_id, ${CONTEST_AGG}
     FROM contest_questions cq
     JOIN questions q ON q.id = cq.question_id
     WHERE cq.contest_id = $1
     ORDER BY cq.sort_order ASC, q.created_at ASC`,
    [contestId],
    client,
  );
  return result.rows.map(mapQuestion);
}

async function listAll(client) {
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
    const result = await query(
      `SELECT q.*, c.title AS contest_title
       FROM questions q
       LEFT JOIN contests c ON c.id = q.contest_id
       ORDER BY q.created_at DESC`,
      [],
      client,
    );
    return result.rows.map(mapQuestion);
  }
  const result = await query(
    `SELECT q.*, ${CONTEST_AGG}
     FROM questions q
     ORDER BY q.created_at DESC`,
    [],
    client,
  );
  return result.rows.map(mapQuestion);
}

async function listPractice(client) {
  const result = await query(
    `SELECT q.*
     FROM questions q
     WHERE q.is_practice = TRUE
       AND q.archived_at IS NULL
     ORDER BY q.sort_order ASC, q.created_at ASC`,
    [],
    client,
  );
  return result.rows.map(mapQuestion);
}

async function findPracticeDevelopmentSeedByTitle(title, client) {
  const row = await queryOne(
    `SELECT q.*
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
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
    const row = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM questions
       WHERE contest_id = $1`,
      [contestId],
      client,
    );
    return Number(row.next_order);
  }
  const row = await queryOne(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM contest_questions
     WHERE contest_id = $1`,
    [contestId],
    client,
  );
  return Number(row.next_order);
}

async function nextUnassignedSortOrder(client) {
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
    const row = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM questions
       WHERE contest_id IS NULL AND is_practice = FALSE`,
      [],
      client,
    );
    return Number(row.next_order);
  }
  const row = await queryOne(
    `SELECT COALESCE(MAX(q.sort_order), -1) + 1 AS next_order
     FROM questions q
     WHERE q.is_practice = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM contest_questions cq WHERE cq.question_id = q.id
       )`,
    [],
    client,
  );
  return Number(row.next_order);
}

async function lockById(id, client) {
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
    const row = await queryOne(
      `SELECT q.*, c.title AS contest_title
       FROM questions q
       LEFT JOIN contests c ON c.id = q.contest_id
       WHERE q.id = $1
       FOR UPDATE OF q`,
      [id],
      client,
    );
    return mapQuestion(row);
  }
  const row = await queryOne(
    `SELECT q.*, ${CONTEST_AGG}
     FROM questions q
     WHERE q.id = $1
     FOR UPDATE OF q`,
    [id],
    client,
  );
  return mapQuestion(row);
}

async function isAttached(contestId, questionId, client) {
  const row = await queryOne(
    `SELECT 1 AS ok
     FROM contest_questions
     WHERE contest_id = $1 AND question_id = $2`,
    [contestId, questionId],
    client,
  );
  return Boolean(row);
}

async function attachToContest(questionId, contestId, sortOrder, client) {
  const row = await queryOne(
    `INSERT INTO contest_questions (contest_id, question_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (contest_id, question_id) DO NOTHING
     RETURNING contest_id`,
    [contestId, questionId, sortOrder],
    client,
  );
  if (!row) {
    return null;
  }
  return findById(questionId, client);
}

async function attachIfAbsent(questionId, contestId, sortOrder, client) {
  const row = await queryOne(
    `INSERT INTO contest_questions (contest_id, question_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (contest_id, question_id) DO NOTHING
     RETURNING contest_id`,
    [contestId, questionId, sortOrder],
    client,
  );
  return Boolean(row);
}

async function detachFromContest(contestId, questionId, client) {
  const row = await queryOne(
    `DELETE FROM contest_questions
     WHERE contest_id = $1 AND question_id = $2
     RETURNING question_id`,
    [contestId, questionId],
    client,
  );
  return Boolean(row);
}

async function setPractice(id, isPractice, client) {
  const row = await queryOne(
    `UPDATE questions
     SET is_practice = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id, Boolean(isPractice)],
    client,
  );
  return Boolean(row);
}

async function archive(id, client) {
  const row = await queryOne(
    `UPDATE questions
     SET archived_at = COALESCE(archived_at, NOW()),
         is_practice = FALSE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id],
    client,
  );
  return Boolean(row);
}

async function deleteById(id, client) {
  const row = await queryOne(
    `DELETE FROM questions WHERE id = $1 RETURNING id`,
    [id],
    client,
  );
  return Boolean(row);
}

async function listMembershipContestIds(questionId, client) {
  const result = await query(
    `SELECT contest_id
     FROM contest_questions
     WHERE question_id = $1
     ORDER BY contest_id`,
    [questionId],
    client,
  );
  return result.rows.map((row) => row.contest_id);
}

async function countQuestionHistory(questionId, client) {
  const row = await queryOne(
    `SELECT
       (SELECT COUNT(*)::int FROM submissions WHERE question_id = $1) AS submissions,
       (SELECT COUNT(*)::int FROM participant_question_states WHERE question_id = $1) AS states,
       (SELECT COUNT(*)::int FROM contest_violations WHERE question_id = $1) AS violations`,
    [questionId],
    client,
  );
  return {
    submissions: Number(row.submissions),
    states: Number(row.states),
    violations: Number(row.violations),
  };
}

async function countContestHistory(questionId, contestId, client) {
  const row = await queryOne(
    `SELECT
       (SELECT COUNT(*)::int FROM submissions WHERE question_id = $1 AND contest_id = $2) AS submissions,
       (SELECT COUNT(*)::int FROM participant_question_states WHERE question_id = $1 AND contest_id = $2) AS states`,
    [questionId, contestId],
    client,
  );
  return {
    submissions: Number(row.submissions),
    states: Number(row.states),
  };
}

function escapeLike(value) {
  return `%${String(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function assignmentPredicate(assignment) {
  if (assignment === 'archived') {
    return 'q.archived_at IS NOT NULL';
  }
  if (assignment === 'unassigned') {
    return `q.archived_at IS NULL
      AND q.is_practice = FALSE
      AND NOT EXISTS (SELECT 1 FROM contest_questions cq WHERE cq.question_id = q.id)`;
  }
  if (assignment === 'practice') {
    return `q.archived_at IS NULL
      AND q.is_practice = TRUE
      AND NOT EXISTS (SELECT 1 FROM contest_questions cq WHERE cq.question_id = q.id)`;
  }
  if (assignment === 'contest') {
    return `q.archived_at IS NULL
      AND q.is_practice = FALSE
      AND EXISTS (SELECT 1 FROM contest_questions cq WHERE cq.question_id = q.id)`;
  }
  if (assignment === 'both') {
    return `q.archived_at IS NULL
      AND q.is_practice = TRUE
      AND EXISTS (SELECT 1 FROM contest_questions cq WHERE cq.question_id = q.id)`;
  }
  return '';
}

async function searchLibrary({ q, difficulty, assignment, limit, offset }, client) {
  const params = [];
  const where = [];
  if (q) {
    params.push(escapeLike(q));
    where.push(`(
      q.title ILIKE $${params.length} ESCAPE '\\'
      OR q.description ILIKE $${params.length} ESCAPE '\\'
      OR q.constraints_text ILIKE $${params.length} ESCAPE '\\'
      OR q.input_format ILIKE $${params.length} ESCAPE '\\'
      OR q.output_format ILIKE $${params.length} ESCAPE '\\'
    )`);
  }
  if (difficulty) {
    params.push(difficulty);
    where.push(`q.difficulty = $${params.length}`);
  }
  const assignmentSql = assignmentPredicate(assignment);
  if (assignmentSql) {
    where.push(assignmentSql);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS n FROM questions q ${whereSql}`,
    params,
    client,
  );
  const listParams = params.slice();
  let paging = '';
  if (Number.isInteger(limit)) {
    listParams.push(limit);
    paging += ` LIMIT $${listParams.length}`;
    listParams.push(Number.isInteger(offset) ? offset : 0);
    paging += ` OFFSET $${listParams.length}`;
  }
  const result = await query(
    `SELECT q.*, ${CONTEST_AGG}
     FROM questions q
     ${whereSql}
     ORDER BY q.created_at DESC
     ${paging}`,
    listParams,
    client,
  );
  return {
    questions: result.rows.map(mapQuestion),
    total: Number(countRow.n),
  };
}

async function assignToContest(id, contestId, sortOrder, client) {
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
    const row = await queryOne(
      `UPDATE questions
       SET contest_id = $2,
           sort_order = $3,
           is_practice = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, contestId, sortOrder],
      client,
    );
    if (!row) {
      return null;
    }
    return findById(id, client);
  }
  return attachToContest(id, contestId, sortOrder, client);
}

async function updateSortOrder(id, contestId, sortOrder, client) {
  const hasJunction = !(await questionsHaveContestIdColumn(client));
  if (!hasJunction) {
    const row = await queryOne(
      `UPDATE questions
       SET sort_order = $3, updated_at = NOW()
       WHERE id = $1 AND contest_id = $2
       RETURNING *`,
      [id, contestId, sortOrder],
      client,
    );
    return mapQuestion(row);
  }
  const row = await queryOne(
    `UPDATE contest_questions
     SET sort_order = $3, updated_at = NOW()
     WHERE question_id = $1 AND contest_id = $2
     RETURNING contest_id, question_id, sort_order`,
    [id, contestId, sortOrder],
    client,
  );
  if (!row) {
    return null;
  }
  return findById(id, client);
}

async function update(id, fields, client) {
  const sets = [];
  const values = [];
  let index = 1;
  const columns = {
    title: 'title',
    description: 'description',
    inputFormat: 'input_format',
    outputFormat: 'output_format',
    constraints: 'constraints_text',
    difficulty: 'difficulty',
    timeLimitSeconds: 'time_limit_seconds',
    memoryLimitMb: 'memory_limit_mb',
    sortOrder: 'sort_order',
  };
  for (const [key, column] of Object.entries(columns)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index}`);
      values.push(fields[key]);
      index += 1;
    }
  }
  if (sets.length === 0) {
    return findById(id, client);
  }
  sets.push('updated_at = NOW()');
  values.push(id);
  await queryOne(
    `UPDATE questions SET ${sets.join(', ')} WHERE id = $${index} RETURNING id`,
    values,
    client,
  );
  return findById(id, client);
}

async function createTestCase(input, client) {
  const hasPoints = await testCasesHavePointsColumn(client);
  const values = [
    input.questionId,
    input.stdin || '',
    input.expectedOutput || '',
    Boolean(input.isHidden),
    input.sortOrder || 0,
  ];
  if (hasPoints) {
    values.push(input.points === undefined || input.points === null ? 10 : Number(input.points));
    const row = await queryOne(
      `INSERT INTO question_test_cases (question_id, stdin, expected_output, is_hidden, sort_order, points)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      values,
      client,
    );
    return mapTestCase(row);
  }
  const row = await queryOne(
    `INSERT INTO question_test_cases (question_id, stdin, expected_output, is_hidden, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    values,
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

async function nextTestCaseSortOrder(questionId, client) {
  const row = await queryOne(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM question_test_cases
     WHERE question_id = $1`,
    [questionId],
    client,
  );
  return Number(row.next_order);
}

async function findTestCaseById(id, client) {
  const row = await queryOne(
    `SELECT * FROM question_test_cases WHERE id = $1`,
    [id],
    client,
  );
  return mapTestCase(row);
}

async function updateTestCase(id, questionId, fields, client) {
  const sets = [];
  const values = [];
  let index = 1;
  const columns = {
    stdin: 'stdin',
    expectedOutput: 'expected_output',
    isHidden: 'is_hidden',
    sortOrder: 'sort_order',
    points: 'points',
  };
  for (const [key, column] of Object.entries(columns)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index}`);
      values.push(fields[key]);
      index += 1;
    }
  }
  if (sets.length === 0) {
    return findTestCaseById(id, client);
  }
  values.push(id, questionId);
  const row = await queryOne(
    `UPDATE question_test_cases
     SET ${sets.join(', ')}
     WHERE id = $${index} AND question_id = $${index + 1}
     RETURNING *`,
    values,
    client,
  );
  return mapTestCase(row);
}

async function deleteTestCase(id, questionId, client) {
  const row = await queryOne(
    `DELETE FROM question_test_cases
     WHERE id = $1 AND question_id = $2
     RETURNING id`,
    [id, questionId],
    client,
  );
  return Boolean(row);
}

async function countTestCases(questionId, client) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS n FROM question_test_cases WHERE question_id = $1`,
    [questionId],
    client,
  );
  return Number(row.n);
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
  nextUnassignedSortOrder,
  lockById,
  isAttached,
  attachToContest,
  attachIfAbsent,
  detachFromContest,
  setPractice,
  archive,
  deleteById,
  listMembershipContestIds,
  countQuestionHistory,
  countContestHistory,
  searchLibrary,
  assignToContest,
  updateSortOrder,
  update,
  nextPracticeSortOrder,
  createTestCase,
  listTestCases,
  nextTestCaseSortOrder,
  findTestCaseById,
  updateTestCase,
  deleteTestCase,
  countTestCases,
};
