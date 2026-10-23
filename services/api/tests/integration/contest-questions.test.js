const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const clock = require('../../src/contests/clock');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';
const T0 = '2026-09-30T10:00:00.000Z';
const START = '2026-09-30T11:00:00.000Z';
const MID = '2026-09-30T11:30:00.000Z';
const END = '2026-09-30T12:00:00.000Z';

describe('Contest questions many-to-many (PostgreSQL)', () => {
  let app;
  let adminToken;
  let studentToken;
  const createdContestIds = [];
  const createdQuestionIds = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = adminLogin.body.data.token;

    const email = uniqueEmail('m9-m2m');
    await request(app).post('/auth/register').send({ email, password: STUDENT_PASSWORD }).expect(201);
    studentToken = (await request(app)
      .post('/auth/login')
      .send({ email, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
  });

  afterEach(() => {
    clock.resetNow();
  });

  after(async () => {
    clock.resetNow();
    for (const id of createdQuestionIds) {
      await query('DELETE FROM questions WHERE id = $1', [id]).catch(() => {});
    }
    for (const id of createdContestIds) {
      await query('DELETE FROM contests WHERE id = $1', [id]).catch(() => {});
    }
    await closePool();
  });

  async function createDraft(title) {
    clock.setNow(T0);
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: title || `M2M Contest ${Date.now()}-${Math.random()}`,
        description: 'many-to-many test',
        startTime: START,
        endTime: END,
      })
      .expect(201);
    createdContestIds.push(created.body.data.contest.id);
    return created.body.data.contest;
  }

  function payload(title) {
    return {
      title,
      description: `${title} statement`,
      inputFormat: 'none',
      outputFormat: 'ok',
      constraints: 'exact',
      difficulty: 'easy',
      testCases: [
        { stdin: '', expectedOutput: 'ok', isHidden: false },
        { stdin: 'hidden', expectedOutput: 'secret', isHidden: true },
      ],
    };
  }

  it('lets one question belong to zero, one, or many contests with independent sort_order', async () => {
    const contestA = await createDraft('Contest A Order');
    const contestB = await createDraft('Contest B Order');
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Shared Q1'))
      .expect(201);
    const q1 = created.body.data.question;
    createdQuestionIds.push(q1.id);
    assert.equal(q1.assignment, 'unassigned');
    assert.deepEqual(q1.contests, []);

    const filler = await request(app)
      .post(`/admin/contests/${contestB.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('B First'))
      .expect(201);

    await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${q1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/admin/contests/${contestB.id}/questions/${q1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = await query(
      `SELECT contest_id, sort_order FROM contest_questions WHERE question_id = $1 ORDER BY sort_order, contest_id`,
      [q1.id],
    );
    assert.equal(rows.rows.length, 2);
    const byContest = Object.fromEntries(rows.rows.map((row) => [row.contest_id, row.sort_order]));
    assert.equal(byContest[contestA.id], 0);
    assert.equal(byContest[contestB.id], 1);

    const questions = await query('SELECT COUNT(*)::int AS n FROM questions WHERE id = $1', [q1.id]);
    assert.equal(questions.rows[0].n, 1);

    const library = await request(app)
      .get('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listed = library.body.data.questions.find((item) => item.id === q1.id);
    assert.ok(listed);
    assert.equal(listed.assignment, 'contest');
    assert.equal(listed.contests.length, 2);
    assert.equal(
      listed.contests.some((row) => row.id === contestA.id && row.title === contestA.title),
      true,
    );
    assert.equal(
      listed.contests.some((row) => row.id === contestB.id && row.title === contestB.title),
      true,
    );

    await request(app)
      .patch(`/admin/contests/${contestB.id}/questions/order`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionIds: [q1.id, filler.body.data.question.id] })
      .expect(200);

    const after = await query(
      `SELECT contest_id, sort_order FROM contest_questions WHERE question_id = $1`,
      [q1.id],
    );
    const next = Object.fromEntries(after.rows.map((row) => [row.contest_id, row.sort_order]));
    assert.equal(next[contestA.id], 0);
    assert.equal(next[contestB.id], 0);
  });

  it('attaches multiple questions in one transaction and rolls back when one id is missing', async () => {
    const contest = await createDraft();
    const a = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Batch A'))
      .expect(201);
    const b = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Batch B'))
      .expect(201);
    createdQuestionIds.push(a.body.data.question.id, b.body.data.question.id);

    const ok = await request(app)
      .post(`/admin/contests/${contest.id}/questions/batch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionIds: [a.body.data.question.id, b.body.data.question.id] })
      .expect(200);
    assert.equal(ok.body.data.questions.length, 2);
    assert.deepEqual(
      ok.body.data.questions.map((item) => item.title),
      ['Batch A', 'Batch B'],
    );

    const extra = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Batch Extra'))
      .expect(201);
    createdQuestionIds.push(extra.body.data.question.id);

    await request(app)
      .post(`/admin/contests/${contest.id}/questions/batch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionIds: [extra.body.data.question.id, '00000000-0000-4000-8000-000000000099'],
      })
      .expect(404);

    const leftover = await query(
      `SELECT 1 FROM contest_questions WHERE contest_id = $1 AND question_id = $2`,
      [contest.id, extra.body.data.question.id],
    );
    assert.equal(leftover.rows.length, 0);
  });

  it('rejects duplicate membership at the database and on delete cascade', async () => {
    const contest = await createDraft();
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Cascade Q'))
      .expect(201);
    const questionId = created.body.data.question.id;
    createdQuestionIds.push(questionId);
    await request(app)
      .post(`/admin/contests/${contest.id}/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await assert.rejects(
      () => query(
        `INSERT INTO contest_questions (contest_id, question_id, sort_order) VALUES ($1, $2, 9)`,
        [contest.id, questionId],
      ),
      (err) => err.code === '23505',
    );

    await query('DELETE FROM contests WHERE id = $1', [contest.id]);
    const gone = await query(
      `SELECT 1 FROM contest_questions WHERE contest_id = $1`,
      [contest.id],
    );
    assert.equal(gone.rows.length, 0);
    const stillQuestion = await query('SELECT id FROM questions WHERE id = $1', [questionId]);
    assert.equal(stillQuestion.rows.length, 1);
  });

  it('edits draft and scheduled contest fields and rejects ended edits', async () => {
    const contest = await createDraft('Editable');
    const updated = await request(app)
      .patch(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Edited Title', description: 'Edited description' })
      .expect(200);
    assert.equal(updated.body.data.contest.title, 'Edited Title');
    const stored = await query('SELECT title, description FROM contests WHERE id = $1', [contest.id]);
    assert.equal(stored.rows[0].title, 'Edited Title');
    assert.equal(stored.rows[0].description, 'Edited description');

    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const scheduled = await request(app)
      .patch(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Scheduled Title' })
      .expect(200);
    assert.equal(scheduled.body.data.contest.title, 'Scheduled Title');

    clock.setNow(END);
    await request(app)
      .get(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .patch(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Should Fail' })
      .expect(409);
  });

  it('edits a shared question and manages test cases without copying the question', async () => {
    const contestA = await createDraft();
    const contestB = await createDraft();
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Editable Shared'))
      .expect(201);
    const questionId = created.body.data.question.id;
    createdQuestionIds.push(questionId);
    await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/admin/contests/${contestB.id}/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const patched = await request(app)
      .patch(`/admin/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Shared Edited', description: 'New statement' })
      .expect(200);
    assert.equal(patched.body.data.question.title, 'Shared Edited');

    const listedA = await request(app)
      .get(`/admin/contests/${contestA.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listedB = await request(app)
      .get(`/admin/contests/${contestB.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(listedA.body.data.questions[0].title, 'Shared Edited');
    assert.equal(listedB.body.data.questions[0].title, 'Shared Edited');
    assert.equal(listedA.body.data.questions[0].id, listedB.body.data.questions[0].id);

    const added = await request(app)
      .post(`/admin/questions/${questionId}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stdin: 'in-2', expectedOutput: 'out-2', isHidden: true })
      .expect(201);
    assert.equal(added.body.data.testCase.sortOrder, 2);

    const cases = await request(app)
      .get(`/admin/questions/${questionId}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(cases.body.data.testCases.length, 3);

    await request(app)
      .patch(`/admin/questions/${questionId}/test-cases/${added.body.data.testCase.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedOutput: 'out-2-edited', isHidden: false })
      .expect(200);

    await request(app)
      .delete(`/admin/questions/${questionId}/test-cases/${added.body.data.testCase.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const afterDelete = await request(app)
      .get(`/admin/questions/${questionId}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(afterDelete.body.data.testCases.length, 2);
    assert.equal(
      afterDelete.body.data.testCases.some((row) => row.id === added.body.data.testCase.id),
      false,
    );

    const first = afterDelete.body.data.testCases[0];
    await request(app)
      .delete(`/admin/questions/${questionId}/test-cases/${afterDelete.body.data.testCases[1].id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .delete(`/admin/questions/${questionId}/test-cases/${first.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app)
      .post(`/admin/questions/${questionId}/test-cases`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ stdin: '', expectedOutput: 'nope' })
      .expect(403);
    await request(app)
      .patch(`/admin/questions/${questionId}`)
      .send({ title: 'Nope' })
      .expect(401);
    await request(app)
      .post(`/admin/questions/${questionId}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stdin: 'x' })
      .expect(400);
    await request(app)
      .patch(`/admin/questions/${questionId}/test-cases/00000000-0000-4000-8000-000000000097`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedOutput: 'nope' })
      .expect(404);
  });

  it('lets students see a shared question in each contest independently without hidden tests', async () => {
    const contestA = await createDraft('Student A');
    const contestB = await createDraft('Student B');
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Shared Student Q'))
      .expect(201);
    const questionId = created.body.data.question.id;
    createdQuestionIds.push(questionId);

    await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/admin/contests/${contestB.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('B Only'))
      .expect(201);
    await request(app)
      .post(`/admin/contests/${contestB.id}/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contestA.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/admin/contests/${contestB.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${contestA.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    await request(app)
      .post(`/student/contests/${contestB.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    clock.setNow(MID);
    const listedA = await request(app)
      .get(`/student/contests/${contestA.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const listedB = await request(app)
      .get(`/student/contests/${contestB.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.deepEqual(listedA.body.data.questions.map((item) => item.id), [questionId]);
    assert.equal(listedB.body.data.questions[1].id, questionId);
    assert.equal(listedA.body.data.questions[0].testCases.length, 1);
    assert.ok(listedA.body.data.questions[0].testCases.every((row) => row.isHidden === false));
    assert.equal(listedA.body.data.questions[0].contests, undefined);

    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contestA.id,
        questionId: listedB.body.data.questions[0].id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'run',
      })
      .expect(400);

    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contestA.id,
        questionId,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'run',
      })
      .expect(503);

    const otherStudentEmail = uniqueEmail('m9-m2m-other');
    await request(app).post('/auth/register').send({ email: otherStudentEmail, password: STUDENT_PASSWORD }).expect(201);
    const otherToken = (await request(app)
      .post('/auth/login')
      .send({ email: otherStudentEmail, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        contestId: contestA.id,
        questionId,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'run',
      })
      .expect(403);
  });

  it('rejects timing edits while running and cascades question deletes', async () => {
    const contest = await createDraft('Running Edit');
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    clock.setNow(MID);
    await request(app)
      .get(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .patch(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: START, endTime: END })
      .expect(409);
    const renamed = await request(app)
      .patch(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Running Title' })
      .expect(200);
    assert.equal(renamed.body.data.contest.title, 'Running Title');

    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload('Delete Me'))
      .expect(201);
    const questionId = created.body.data.question.id;
    await request(app)
      .post(`/admin/contests/${contest.id}/questions/${questionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await query('DELETE FROM questions WHERE id = $1', [questionId]);
    const leftover = await query(
      `SELECT 1 FROM contest_questions WHERE question_id = $1`,
      [questionId],
    );
    assert.equal(leftover.rows.length, 0);
  });
});
