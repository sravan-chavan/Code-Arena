const { query, queryOne } = require('../db/query');

function mapContest(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    startTime: row.start_time instanceof Date ? row.start_time.toISOString() : row.start_time,
    durationMinutes: row.duration_minutes,
    createdBy: row.created_by,
    isDevelopmentSeed: row.is_development_seed,
    questionCount: row.question_count === undefined ? undefined : Number(row.question_count),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function create(input, client) {
  const row = await queryOne(
    `INSERT INTO contests (title, description, status, start_time, duration_minutes, created_by, is_development_seed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.title,
      input.description || '',
      input.status || 'running',
      input.startTime || null,
      input.durationMinutes || 60,
      input.createdBy,
      Boolean(input.isDevelopmentSeed),
    ],
    client,
  );
  return mapContest(row);
}

async function findById(id, client) {
  const row = await queryOne(
    `SELECT c.*, (
       SELECT COUNT(*)::int FROM questions q WHERE q.contest_id = c.id
     ) AS question_count
     FROM contests c
     WHERE c.id = $1`,
    [id],
    client,
  );
  return mapContest(row);
}

async function findDevelopmentSeedByTitle(title, client) {
  const row = await queryOne(
    `SELECT * FROM contests
     WHERE is_development_seed = TRUE AND title = $1
     LIMIT 1`,
    [title],
    client,
  );
  return mapContest(row);
}

async function listAll(client) {
  const result = await query(
    `SELECT c.*, (
       SELECT COUNT(*)::int FROM questions q WHERE q.contest_id = c.id
     ) AS question_count
     FROM contests c
     ORDER BY c.created_at DESC`,
    [],
    client,
  );
  return result.rows.map(mapContest);
}

async function listVisibleToStudents(client) {
  const result = await query(
    `SELECT c.*, (
       SELECT COUNT(*)::int FROM questions q WHERE q.contest_id = c.id
     ) AS question_count
     FROM contests c
     WHERE c.status IN ('scheduled', 'running', 'ended')
     ORDER BY
       CASE c.status WHEN 'running' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
       c.created_at DESC`,
    [],
    client,
  );
  return result.rows.map(mapContest);
}

module.exports = {
  mapContest,
  create,
  findById,
  findDevelopmentSeedByTitle,
  listAll,
  listVisibleToStudents,
};
