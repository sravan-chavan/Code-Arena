const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const { applyExecutionResult } = require('../../src/submissions/submission.service');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';

describe('Contest and execution APIs (PostgreSQL)', () => {
  let app;
  let studentEmail;
  let adminToken;
  let studentToken;
  let contestId;
  let questionId;
  const createdContestIds = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();
    studentEmail = uniqueEmail('contest-student');

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = adminLogin.body.data.token;

    await request(app)
      .post('/auth/register')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(201);

    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(200);
    studentToken = studentLogin.body.data.token;
  });

  after(async () => {
    for (const id of createdContestIds) {
      await query('DELETE FROM contests WHERE id = $1', [id]).catch(() => {});
    }
    if (studentEmail) {
      await query('DELETE FROM users WHERE email = $1', [studentEmail]).catch(() => {});
    }
    await closePool();
  });

  it('rejects student access to admin contest mutations', async () => {
    await request(app)
      .get('/admin/contests')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Should Fail' })
      .expect(403);
  });

  it('lets an admin persist a contest and question', async () => {
    const title = `E2E Contest ${Date.now()}`;
    const startTime = new Date(Date.now() - 60_000).toISOString();
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: 'API integration contest',
        startTime,
        durationMinutes: 45,
      })
      .expect(201);

    assert.equal(created.body.success, true);
    assert.equal(created.body.data.contest.title, title);
    assert.equal(created.body.data.contest.status, 'draft');
    contestId = created.body.data.contest.id;
    createdContestIds.push(contestId);

    const stored = await query('SELECT title, status FROM contests WHERE id = $1', [contestId]);
    assert.equal(stored.rows[0].title, title);
    assert.equal(stored.rows[0].status, 'draft');

    const scheduled = await request(app)
      .post(`/admin/contests/${contestId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(scheduled.body.data.contest.status, 'running');

    const question = await request(app)
      .post(`/admin/contests/${contestId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Hello World',
        description: 'Print Hello CodeArena',
        inputFormat: 'none',
        outputFormat: 'Hello CodeArena',
        constraints: 'exact match',
        difficulty: 'easy',
        testCases: [
          { stdin: '', expectedOutput: 'Hello CodeArena', isHidden: false },
          { stdin: '', expectedOutput: 'Hello CodeArena', isHidden: true },
        ],
      })
      .expect(201);

    questionId = question.body.data.question.id;
    assert.equal(question.body.data.question.testCases.length, 2);
    const cases = await query(
      'SELECT is_hidden FROM question_test_cases WHERE question_id = $1',
      [questionId],
    );
    assert.equal(cases.rows.length, 2);
  });

  it('seeds the development Test contest exactly once', async () => {
    const rows = await query(
      `SELECT id, title FROM contests WHERE is_development_seed = TRUE AND title = 'Test'`,
    );
    assert.equal(rows.rows.length, 1);

    const second = await runMigrations();
    assert.ok(second.skipped.includes('005'));
    const after = await query(
      `SELECT COUNT(*)::int AS n FROM contests WHERE is_development_seed = TRUE AND title = 'Test'`,
    );
    assert.equal(after.rows[0].n, 1);
  });

  it('lets a student see running contests and public sample data only', async () => {
    const list = await request(app)
      .get('/student/contests')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    const titles = list.body.data.contests.map((contest) => contest.title);
    assert.ok(titles.includes('Test'));
    assert.ok(list.body.data.contests.some((contest) => contest.id === contestId));
    assert.equal(list.body.data.contests[0].isDevelopmentSeed, undefined);

    await request(app)
      .get(`/student/contests/${contestId}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await request(app)
      .post(`/student/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const questions = await request(app)
      .get(`/student/contests/${contestId}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    assert.equal(questions.body.data.questions.length, 1);
    assert.equal(questions.body.data.questions[0].sampleOutput, 'Hello CodeArena');
    assert.equal(
      questions.body.data.questions[0].testCases.every((testCase) => testCase.isHidden === false),
      true,
    );
    assert.equal(questions.body.data.questions[0].testCases.length, 1);
  });

  it('rejects unauthenticated contest and language access', async () => {
    await request(app).get('/student/contests').expect(401);
    await request(app).get('/student/languages').expect(401);
    await request(app).post('/student/executions').send({}).expect(401);
  });

  it('lists supported languages for students', async () => {
    const res = await request(app)
      .get('/student/languages')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const slugs = res.body.data.languages.map((language) => language.slug);
    assert.deepEqual(slugs, ['python', 'cpp', 'java', 'javascript']);
  });

  it('returns 503 when the execution queue is not connected', async () => {
    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId,
        questionId,
        language: 'python',
        sourceCode: 'print("Hello CodeArena")',
        kind: 'run',
      })
      .expect(503);
  });

  it('applies a Judge0 result onto a queued submission row', async () => {
    const userRow = await query('SELECT id FROM users WHERE email = $1', [studentEmail]);
    const inserted = await query(
      `INSERT INTO submissions (
         user_id, contest_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, $2, $3, 'python', 71, 'print(1)', 'run', 'QUEUED', 1)
       RETURNING id`,
      [userRow.rows[0].id, contestId, questionId],
    );
    const submissionId = inserted.rows[0].id;

    const updated = await applyExecutionResult({
      jobId: submissionId,
      status: 'WRONG_ANSWER',
      stdout: '99',
      stderr: null,
      compileOutput: null,
      message: null,
      exitCode: 0,
      time: '0.01',
      memory: 1024,
      token: 'tok-test',
      testsPassed: 0,
      testsTotal: 1,
    });
    assert.equal(updated.status, 'WRONG_ANSWER');
    assert.equal(updated.stdout, '99');

    const fetched = await request(app)
      .get(`/student/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(fetched.body.data.submission.status, 'WRONG_ANSWER');
    assert.equal(fetched.body.data.submission.sourceCode, undefined);
  });
});
