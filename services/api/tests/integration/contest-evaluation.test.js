const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const clock = require('../../src/contests/clock');
const { applyExecutionResult } = require('../../src/submissions/submission.service');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';
const T0 = '2026-09-30T10:00:00.000Z';
const START = '2026-09-30T11:00:00.000Z';
const MID = '2026-09-30T11:20:00.000Z';
const BEFORE_DEADLINE = '2026-09-30T11:40:00.000Z';
const LATE = '2026-09-30T11:50:00.000Z';
const END = '2026-09-30T12:00:00.000Z';

describe('Contest evaluation (PostgreSQL)', () => {
  let app;
  let adminToken;
  let studentToken;
  let otherToken;
  let studentEmail;
  let otherEmail;
  const createdContestIds = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();
    studentEmail = uniqueEmail('m10-student');
    otherEmail = uniqueEmail('m10-other');

    adminToken = (await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200)).body.data.token;

    await request(app).post('/auth/register').send({ email: studentEmail, password: STUDENT_PASSWORD }).expect(201);
    await request(app).post('/auth/register').send({ email: otherEmail, password: STUDENT_PASSWORD }).expect(201);
    studentToken = (await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
    otherToken = (await request(app)
      .post('/auth/login')
      .send({ email: otherEmail, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
  });

  afterEach(() => {
    clock.resetNow();
  });

  after(async () => {
    clock.resetNow();
    for (const id of createdContestIds) {
      await query('DELETE FROM contests WHERE id = $1', [id]).catch(() => {});
    }
    if (studentEmail) {
      await query('DELETE FROM users WHERE email = $1', [studentEmail]).catch(() => {});
    }
    if (otherEmail) {
      await query('DELETE FROM users WHERE email = $1', [otherEmail]).catch(() => {});
    }
    await closePool();
  });

  async function createRunningContest(title = `M10 ${Date.now()}`, extras = {}) {
    clock.setNow(T0);
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: 'M10 evaluation',
        startTime: START,
        endTime: extras.endTime || END,
        durationMinutes: extras.durationMinutes || 60,
      })
      .expect(201);
    const contest = created.body.data.contest;
    createdContestIds.push(contest.id);
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    clock.setNow(MID);
    return contest;
  }

  async function addQuestion(contestId, title, tests) {
    const created = await request(app)
      .post(`/admin/contests/${contestId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: title,
        difficulty: 'easy',
        testCases: tests,
      })
      .expect(201);
    return created.body.data.question;
  }

  it('defaults test-case points to 10, persists edits, and sums question/contest totals', async () => {
    const contest = await createRunningContest();
    const created = await addQuestion(contest.id, 'Points Q', [
      { stdin: '1', expectedOutput: '1', isHidden: false },
      { stdin: '2', expectedOutput: '2', isHidden: true, points: 20 },
    ]);
    assert.equal(created.testCases[0].points, 10);
    assert.equal(created.testCases[1].points, 20);
    assert.equal(created.totalPoints, 30);

    const added = await request(app)
      .post(`/admin/questions/${created.id}/test-cases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stdin: '3', expectedOutput: '3', isHidden: false })
      .expect(201);
    assert.equal(added.body.data.testCase.points, 10);

    await request(app)
      .patch(`/admin/questions/${created.id}/test-cases/${created.testCases[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points: 30 })
      .expect(200);

    const loaded = await request(app)
      .get(`/admin/questions/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(loaded.body.data.question.totalPoints, 60);

    const stored = await query(
      'SELECT points FROM question_test_cases WHERE id = $1',
      [created.testCases[0].id],
    );
    assert.equal(stored.rows[0].points, 30);

    const contestLoaded = await request(app)
      .get(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(contestLoaded.body.data.contest.totalPoints, 60);
  });

  it('starts a persisted session whose deadline survives refresh and rejects expired submits', async () => {
    const contest = await createRunningContest(`Timer ${Date.now()}`);
    const question = await addQuestion(contest.id, 'Timer Q', [
      { stdin: '', expectedOutput: 'ok', isHidden: false, points: 10 },
    ]);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    clock.setNow(MID);
    const entered = await request(app)
      .post(`/student/contests/${contest.id}/enter`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const originalDeadline = entered.body.data.session.effectiveDeadline;
    assert.ok(originalDeadline);

    await query(
      `UPDATE contest_participants
       SET effective_deadline = $2
       WHERE id = $1`,
      [entered.body.data.session.participantId, LATE],
    );

    clock.setNow(BEFORE_DEADLINE);
    const resumed = await request(app)
      .get(`/student/contests/${contest.id}/session`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(resumed.body.data.session.effectiveDeadline, LATE);
    assert.equal(resumed.body.data.session.sessionExpired, false);

    clock.setNow(LATE);
    const expired = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contest.id,
        questionId: question.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'submit',
      })
      .expect(409);
    assert.equal(expired.body.code, 'SESSION_EXPIRED');
  });

  it('scores partial tests, ignores invalidated questions, and ranks from persisted data', async () => {
    const contest = await createRunningContest();
    const q1 = await addQuestion(contest.id, 'Q1', [
      { stdin: 'a', expectedOutput: 'a', isHidden: false, points: 10 },
      { stdin: 'b', expectedOutput: 'b', isHidden: false, points: 10 },
      { stdin: 'c', expectedOutput: 'c', isHidden: true, points: 20 },
    ]);
    const q2 = await addQuestion(contest.id, 'Q2', [
      { stdin: 'x', expectedOutput: 'x', isHidden: false, points: 10 },
      { stdin: 'y', expectedOutput: 'y', isHidden: true, points: 30 },
    ]);
    const q3 = await addQuestion(contest.id, 'Q3', [
      { stdin: 'p', expectedOutput: 'p', isHidden: false, points: 20 },
      { stdin: 'q', expectedOutput: 'q', isHidden: false, points: 20 },
    ]);

    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(201);

    clock.setNow(MID);
    const session = (await request(app)
      .post(`/student/contests/${contest.id}/enter`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)).body.data.session;

    await request(app)
      .post(`/student/contests/${contest.id}/current-question`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ questionId: q3.id })
      .expect(200);

    const hidden = await request(app)
      .get(`/student/contests/${contest.id}/questions/${q1.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(hidden.body.data.question.testCases.every((row) => row.isHidden === false), true);
    assert.equal(hidden.body.data.question.totalPoints, 40);

    const userId = (await query('SELECT id FROM users WHERE email = $1', [studentEmail])).rows[0].id;
    const q1Sub = await query(
      `INSERT INTO submissions (
         user_id, contest_id, participant_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, $2, $3, $4, 'python', 71, 'print(1)', 'submit', 'QUEUED', 3)
       RETURNING id`,
      [userId, contest.id, session.participantId, q1.id],
    );
    await applyExecutionResult({
      jobId: q1Sub.rows[0].id,
      status: 'WRONG_ANSWER',
      testsPassed: 2,
      testsTotal: 3,
      score: 20,
      testResults: [
        { testCaseId: q1.testCases[0].id, sortOrder: 0, isHidden: false, status: 'ACCEPTED', passed: true, points: 10, pointsEarned: 10 },
        { testCaseId: q1.testCases[1].id, sortOrder: 1, isHidden: false, status: 'ACCEPTED', passed: true, points: 10, pointsEarned: 10 },
        { testCaseId: q1.testCases[2].id, sortOrder: 2, isHidden: true, status: 'WRONG_ANSWER', passed: false, points: 20, pointsEarned: 0 },
      ],
    });

    const q2Sub = await query(
      `INSERT INTO submissions (
         user_id, contest_id, participant_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, $2, $3, $4, 'python', 71, 'print(1)', 'submit', 'QUEUED', 2)
       RETURNING id`,
      [userId, contest.id, session.participantId, q2.id],
    );
    await applyExecutionResult({
      jobId: q2Sub.rows[0].id,
      status: 'ACCEPTED',
      testsPassed: 2,
      testsTotal: 2,
      score: 40,
      testResults: [
        { testCaseId: q2.testCases[0].id, sortOrder: 0, isHidden: false, status: 'ACCEPTED', passed: true, points: 10, pointsEarned: 10 },
        { testCaseId: q2.testCases[1].id, sortOrder: 1, isHidden: true, status: 'ACCEPTED', passed: true, points: 30, pointsEarned: 30 },
      ],
    });

    const studentView = await request(app)
      .get(`/student/submissions/${q1Sub.rows[0].id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(studentView.body.data.submission.testResults.length, 2);
    assert.equal(studentView.body.data.submission.testResults.every((row) => row.isHidden === false), true);

    const violation = await request(app)
      .post(`/student/contests/${contest.id}/violations`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'TAB_SWITCH' })
      .expect(201);
    assert.equal(violation.body.data.session.tabSwitchCount, 1);
    assert.ok(violation.body.data.session.invalidatedQuestionIds.includes(q3.id));

    const q3Sub = await query(
      `INSERT INTO submissions (
         user_id, contest_id, participant_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, $2, $3, $4, 'python', 71, 'print(1)', 'submit', 'QUEUED', 2)
       RETURNING id`,
      [userId, contest.id, session.participantId, q3.id],
    );
    const blocked = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contest.id,
        questionId: q3.id,
        language: 'python',
        sourceCode: 'print("p")',
        kind: 'submit',
      })
      .expect(409);
    assert.equal(blocked.body.code, 'QUESTION_INVALIDATED');

    await applyExecutionResult({
      jobId: q3Sub.rows[0].id,
      status: 'ACCEPTED',
      testsPassed: 2,
      testsTotal: 2,
      score: 40,
      testResults: [
        { testCaseId: q3.testCases[0].id, sortOrder: 0, isHidden: false, status: 'ACCEPTED', passed: true, points: 20, pointsEarned: 20 },
        { testCaseId: q3.testCases[1].id, sortOrder: 1, isHidden: false, status: 'ACCEPTED', passed: true, points: 20, pointsEarned: 20 },
      ],
    });

    const persisted = await query(
      `SELECT score, possible_score, tab_switch_count
       FROM contest_participants WHERE id = $1`,
      [session.participantId],
    );
    assert.equal(Number(persisted.rows[0].score), 60);
    assert.equal(Number(persisted.rows[0].possible_score), 80);
    assert.equal(Number(persisted.rows[0].tab_switch_count), 1);

    await request(app)
      .post(`/student/contests/${contest.id}/violations`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'TAB_SWITCH' })
      .expect(201);
    const counted = await query(
      'SELECT tab_switch_count FROM contest_participants WHERE id = $1',
      [session.participantId],
    );
    assert.equal(Number(counted.rows[0].tab_switch_count), 2);

    const ranking = await request(app)
      .get(`/student/contests/${contest.id}/ranking`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(ranking.body.data.ranking[0].score, 60);
    assert.equal(ranking.body.data.ranking[0].rank, 1);
    assert.equal(ranking.body.data.ranking[0].email, undefined);

    const adminParticipants = await request(app)
      .get(`/admin/contests/${contest.id}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const mine = adminParticipants.body.data.participants.find((row) => row.email === studentEmail);
    assert.equal(mine.score, 60);
    assert.equal(mine.tabSwitchCount, 2);
  });

  it('lets admin remove a running participant and blocks re-entry and submits', async () => {
    const contest = await createRunningContest();
    const question = await addQuestion(contest.id, 'Remove Q', [
      { stdin: '', expectedOutput: 'ok', isHidden: false, points: 10 },
    ]);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    clock.setNow(MID);
    const session = (await request(app)
      .post(`/student/contests/${contest.id}/enter`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)).body.data.session;

    const userId = (await query('SELECT id FROM users WHERE email = $1', [studentEmail])).rows[0].id;
    await query(
      `INSERT INTO submissions (
         user_id, contest_id, participant_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total, score
       ) VALUES ($1, $2, $3, $4, 'python', 71, 'print(1)', 'submit', 'ACCEPTED', 1, 10)`,
      [userId, contest.id, session.participantId, question.id],
    );

    const removed = await request(app)
      .post(`/admin/contests/${contest.id}/participants/${session.participantId}/remove`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(removed.body.data.participant.status, 'removed');

    const enterAgain = await request(app)
      .post(`/student/contests/${contest.id}/enter`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    assert.equal(enterAgain.body.code, 'PARTICIPANT_REMOVED');

    const submit = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contest.id,
        questionId: question.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'submit',
      })
      .expect(403);
    assert.equal(submit.body.code, 'PARTICIPANT_REMOVED');

    const history = await query(
      'SELECT COUNT(*)::int AS n FROM submissions WHERE participant_id = $1',
      [session.participantId],
    );
    assert.equal(history.rows[0].n, 1);
  });

  it('rejects unregistered, cross-contest, and non-running submissions', async () => {
    clock.setNow(T0);
    const draft = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `Draft ${Date.now()}`, startTime: START, endTime: END, durationMinutes: 60 })
      .expect(201);
    createdContestIds.push(draft.body.data.contest.id);
    const draftQuestion = await addQuestion(draft.body.data.contest.id, 'Draft Q', [
      { stdin: '', expectedOutput: 'ok', isHidden: false, points: 10 },
    ]);

    const running = await createRunningContest(`Run ${Date.now()}`);
    const runningQuestion = await addQuestion(running.id, 'Run Q', [
      { stdin: '', expectedOutput: 'ok', isHidden: false, points: 10 },
    ]);
    const other = await createRunningContest(`Other ${Date.now()}`);
    await addQuestion(other.id, 'Other Q', [
      { stdin: '', expectedOutput: 'ok', isHidden: false, points: 10 },
    ]);

    await request(app)
      .post(`/student/contests/${running.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const unregistered = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        contestId: running.id,
        questionId: runningQuestion.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'submit',
      })
      .expect(403);
    assert.equal(unregistered.body.code, 'REGISTRATION_REQUIRED');

    clock.setNow(MID);
    const cross = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: other.id,
        questionId: runningQuestion.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'submit',
      })
      .expect(400);
    assert.match(cross.body.message, /does not belong/i);

    const draftSubmit = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: draft.body.data.contest.id,
        questionId: draftQuestion.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'submit',
      })
      .expect(404);

    assert.equal(draftSubmit.status, 404);
  });
});
