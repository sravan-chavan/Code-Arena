const { initPool, getPool, closePool, waitForDatabase, warmPool, isPoolOpen } = require('./pool');
const { query, queryOne } = require('./query');
const { withTransaction } = require('./transaction');
const { checkDatabase } = require('./health');
const { runMigrations, rollbackLast, getAppliedMigrations } = require('./migrate');
const { isDatabaseError, sanitizeDatabaseError } = require('./errors');

module.exports = {
  initPool,
  getPool,
  closePool,
  waitForDatabase,
  warmPool,
  isPoolOpen,
  query,
  queryOne,
  withTransaction,
  checkDatabase,
  runMigrations,
  rollbackLast,
  getAppliedMigrations,
  isDatabaseError,
  sanitizeDatabaseError,
};
