const { test, expect } = require('@playwright/test');
const { api, login, loginAsAdmin, uiLogin } = require('./helpers');

async function runningContest(request) {
  const adminToken = await loginAsAdmin(request);
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const contest = await api(request, 'post', '/admin/contests', {
    token: adminToken,
    data: {
      title: `E2E Realtime ${Date.now()}`,
      startTime: start,
      endTime: end,
      durationMinutes: 60,
    },
  });
  const contestId = contest.body.data.contest.id;
  await api(request, 'post', `/admin/contests/${contestId}/questions`, {
    token: adminToken,
    data: {
      title: 'Add',
      description: 'print the sum',
      testCases: [{ stdin: '1 2', expectedOutput: '3', isHidden: false, points: 10 }],
    },
  });
  await api(request, 'post', `/admin/contests/${contestId}/schedule`, { token: adminToken, data: {} });
  return { adminToken, contestId };
}

async function registerStudent(request, contestId, adminToken) {
  const email = `e2e-rt-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await api(request, 'post', '/auth/register', {
    data: { email, password: 'student-pass' },
  });
  const token = await login(request, email, 'student-pass');
  await api(request, 'post', `/student/contests/${contestId}/register`, {
    token,
    data: {},
  });
  const participants = await api(request, 'get', `/admin/contests/${contestId}/participants`, {
    token: adminToken,
  });
  const participant = (participants.body.data.participants || []).find((row) => row.email === email);
  return { email, token, participantId: participant && participant.id };
}

async function enterArena(page, email, contestId) {
  await uiLogin(page, email, 'student-pass');
  await page.waitForURL(/\/client/, { timeout: 15000 });
  await page.goto(`/client/contests/${contestId}/arena`);
  await expect(page.getByText('Remaining')).toBeVisible();
  await page.waitForFunction((id) => window.__wsSubscribed && window.__wsSubscribed[id], contestId, { timeout: 10000 });
}

test.describe('M11 realtime contest events', () => {
  test('arena does not poll ranking or session while the timer runs', async ({ page, request }) => {
    const { adminToken, contestId } = await runningContest(request);
    const student = await registerStudent(request, contestId, adminToken);
    await page.addInitScript(() => {
      window.__codearenaCountRequests = true;
      window.__codearenaRequestCounts = {};
    });
    await enterArena(page, student.email, contestId);
    await page.evaluate(() => { window.__codearenaRequestCounts = {}; });
    await page.waitForTimeout(3500);
    const counts = await page.evaluate(() => window.__codearenaRequestCounts);
    const ranking = Object.entries(counts).filter(([key]) => key.includes('/ranking'));
    const session = Object.entries(counts).filter(([key]) => key.includes('/session'));
    const submissionPolls = Object.entries(counts).filter(([key]) => key.startsWith('GET /student/submissions/'));
    expect(ranking).toEqual([]);
    expect(session).toEqual([]);
    expect(submissionPolls).toEqual([]);
  });

  test('admin end and removal reach the student without a refresh', async ({ page, request }) => {
    const { adminToken, contestId } = await runningContest(request);
    const student = await registerStudent(request, contestId, adminToken);
    await enterArena(page, student.email, contestId);

    const questions = await api(request, 'get', `/admin/contests/${contestId}/questions`, { token: adminToken });
    const questionId = questions.body.data.questions[0].id;
    const ended = await api(request, 'post', `/admin/contests/${contestId}/end`, {
      token: adminToken,
      data: {},
    });
    expect(ended.status).toBe(200);
    await expect(page.getByTestId('contest-lock')).toContainText('ended', { timeout: 10000 });

    const denied = await api(request, 'post', '/student/executions', {
      token: student.token,
      data: {
        contestId,
        questionId,
        language: 'python',
        sourceCode: 'print(1)',
        kind: 'run',
      },
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
  });

  test('removed participant is locked in real time and the API still rejects them', async ({ page, request }) => {
    const { adminToken, contestId } = await runningContest(request);
    const student = await registerStudent(request, contestId, adminToken);
    await enterArena(page, student.email, contestId);
    const removed = await api(request, 'post', `/admin/contests/${contestId}/participants/${student.participantId}/remove`, {
      token: adminToken,
      data: {},
    });
    expect(removed.status).toBe(200);
    await expect(page.getByTestId('contest-lock')).toContainText('removed', { timeout: 10000 });
    const session = await api(request, 'get', `/student/contests/${contestId}/session`, { token: student.token });
    expect(session.status).toBeGreaterThanOrEqual(400);
  });

  test('two students both receive contest.ended and reconnect reconciles', async ({ browser, request }) => {
    const { adminToken, contestId } = await runningContest(request);
    const studentA = await registerStudent(request, contestId, adminToken);
    const studentB = await registerStudent(request, contestId, adminToken);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await enterArena(pageA, studentA.email, contestId);
    await enterArena(pageB, studentB.email, contestId);

    await pageA.evaluate((id) => {
      window.__wsSubscribed[id] = false;
      window.__codearenaRealtime.ws.close();
    }, contestId);
    await expect(pageA.getByTestId('ws-status')).toHaveText(/Reconnecting|Offline/);
    await expect(pageA.getByTestId('ws-status')).toHaveText('Live', { timeout: 15000 });
    await pageA.waitForFunction((id) => window.__wsSubscribed && window.__wsSubscribed[id], contestId);

    await api(request, 'post', `/admin/contests/${contestId}/end`, { token: adminToken, data: {} });
    await expect(pageA.getByTestId('contest-lock')).toContainText('ended', { timeout: 10000 });
    await expect(pageB.getByTestId('contest-lock')).toContainText('ended', { timeout: 10000 });
    await contextA.close();
    await contextB.close();
  });
});
