const { query, queryOne } = require('../db/query');
const { isRole, ROLES } = require('../auth/roles');

function mapPublic(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapWithPasswordHash(row) {
  const user = mapPublic(row);
  if (!user) {
    return null;
  }
  return {
    ...user,
    passwordHash: row.password_hash,
  };
}

/**
 * @param {string} id
 * @param {import('pg').PoolClient} [client]
 */
async function findById(id, client) {
  if (typeof id !== 'string' || id.trim() === '') {
    return null;
  }

  try {
    const row = await queryOne(
      `SELECT id, email, role, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id],
      client,
    );
    return mapPublic(row);
  } catch (err) {
    if (err && err.code === '22P02') {
      return null;
    }
    throw err;
  }
}

/**
 * @param {string} email already normalized
 * @param {import('pg').PoolClient} [client]
 */
async function findByEmail(email, client) {
  const row = await queryOne(
    `SELECT id, email, role, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email],
    client,
  );
  return mapPublic(row);
}

/**
 * @param {string} email already normalized
 * @param {import('pg').PoolClient} [client]
 */
async function findByEmailWithPasswordHash(email, client) {
  const row = await queryOne(
    `SELECT id, email, role, password_hash, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email],
    client,
  );
  return mapWithPasswordHash(row);
}

/**
 * @param {{ email: string, passwordHash: string, role?: string }} input
 * @param {import('pg').PoolClient} [client]
 */
async function create(input, client) {
  const role = input.role || ROLES.STUDENT;
  if (!isRole(role)) {
    const error = new Error('Invalid role');
    error.code = 'INVALID_ROLE';
    throw error;
  }

  try {
    const row = await queryOne(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at, updated_at`,
      [input.email, input.passwordHash, role],
      client,
    );
    return mapPublic(row);
  } catch (err) {
    if (err && err.code === '23505') {
      const duplicate = new Error('Email already registered');
      duplicate.code = 'EMAIL_TAKEN';
      throw duplicate;
    }
    throw err;
  }
}

module.exports = {
  findById,
  findByEmail,
  findByEmailWithPasswordHash,
  create,
};
