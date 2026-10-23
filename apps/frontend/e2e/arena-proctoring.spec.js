const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { api, login, loginAsAdmin, uiLogin, ADMIN } = require('./helpers');

function pgEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    vars[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return {
    user: vars.POSTGRES_USER || 'codearena',
    database: vars.POSTGRES_DB || 'codearena',
  };
}

function pg(sql) {
  const { user, database } = pgEnv();
  return execFileSync('docker', [
    'exec',
    'codearena-postgres',
    'psql',
    '-U',
    user,
    '-d',
    database,
    '-t',
    '-A',
    '-c',
    sql,
  ], { encoding: 'utf8' }).trim();
}

test('arena fullscreen gate, violation, exit, and admin re-add', async ({ page, request }) => {
  test.setTimeout(120_000);
  const adminToken = await loginAsAdmin(request);
  const email = `e2e-proctor-${Date.now()}@example.com`;
  const registered = await api(request, 'post', '/auth/register', {
    data: { email, password: 'student-pass' },
  });
  expect(registered.status).toBe(201);
  const studentToken = await login(request, email, 'student-pass');

  const contest = await api(request, 'post', '/admin/contests', {
    token: adminToken,
    data: {
      title: `E2E Proctor ${Date.now()}`,
      description: 'fullscreen',
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      durationMinutes: 60,
    },
  });
  expect(contest.status).toBe(201);
  const contestId = contest.body.data.contest.id;
  const firstQuestion = await api(request, 'post', `/admin/contests/${contestId}/questions`, {
    token: adminToken,
    data: {
      title: 'First',
      description: 'first question',
      testCases: [
        { stdin: '1', expectedOutput: '1', isHidden: false, points: 10 },
        { stdin: '2', expectedOutput: '2', isHidden: true, points: 20 },
      ],
    },
  });
  const secondQuestion = await api(request, 'post', `/admin/contests/${contestId}/questions`, {
    token: adminToken,
    data: {
      title: 'Second',
      description: 'second question',
      testCases: [{ stdin: '1', expectedOutput: '1', isHidden: false, points: 10 }],
    },
  });
  expect(firstQuestion.status).toBe(201);
  expect(secondQuestion.status).toBe(201);
  const scheduled = await api(request, 'post', `/admin/contests/${contestId}/schedule`, {
    token: adminToken,
    data: {},
  });
  expect(scheduled.body.data.contest.status).toBe('running');
  await api(request, 'post', `/student/contests/${contestId}/register`, {
    token: studentToken,
    data: {},
  });

  await uiLogin(page, email, 'student-pass');
  await page.goto(`/client/contests/${contestId}`);
  await page.getByRole('button', { name: 'Enter Contest' }).click();
  await expect(page.getByTestId('fullscreen-gate')).toBeVisible();
  await expect(page.getByTestId('fullscreen-warning')).toContainText('Fullscreen is required');
  await expect(page.getByTestId('fullscreen-warning')).toContainText('Ctrl+Shift+C');
  await expect(page.getByText('Remaining')).toBeVisible();

  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect.poll(async () => page.evaluate(() => (
    document.fullscreenElement
      ? 'entered'
      : (document.querySelector('[data-testid="fullscreen-error"]') ? 'rejected' : '')
  ))).toMatch(/entered|rejected/);
  const fullscreenEntered = await page.evaluate(() => Boolean(document.fullscreenElement));
  if (!fullscreenEntered) {
    await expect(page.getByTestId('fullscreen-error')).toBeVisible();
    await expect(page.getByTestId('fullscreen-gate')).toBeVisible();
  } else {
    await expect(page.getByTestId('fullscreen-gate')).toHaveCount(0);
  }

  await expect.poll(async () => {
    const session = await api(request, 'get', `/student/contests/${contestId}/session`, { token: studentToken });
    return session.body.data.session?.currentQuestionId || '';
  }).toBeTruthy();
  const session = await api(request, 'get', `/student/contests/${contestId}/session`, { token: studentToken });
  const participantId = session.body.data.session.participantId;
  const questionId = session.body.data.session.currentQuestionId;
  expect([firstQuestion.body.data.question.id, secondQuestion.body.data.question.id]).toContain(questionId);
  pg(`
    INSERT INTO participant_question_states (
      contest_id, participant_id, question_id, invalidated, earned_points, possible_points
    ) VALUES (
      '${contestId}', '${participantId}', '${questionId}', FALSE, 30, 30
    )
    ON CONFLICT (contest_id, participant_id, question_id)
    DO UPDATE SET invalidated = FALSE, earned_points = 30, possible_points = 30, updated_at = NOW()
  `);
  pg(`UPDATE contest_participants SET score = 30, possible_score = 40 WHERE id = '${participantId}'`);

  const violationResponse = page.waitForResponse((response) => (
    response.url().includes(`/student/contests/${contestId}/violations`)
    && response.request().method() === 'POST'
  ), { timeout: 15_000 });

  if (fullscreenEntered) {
    await page.evaluate(() => document.exitFullscreen());
  } else {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  const violation = await violationResponse;
  expect(violation.status()).toBe(201);
  await expect(page.getByTestId('proctor-violation')).toBeVisible();
  expect(pg(
    `SELECT earned_points::text || ':' || invalidated::text FROM participant_question_states WHERE participant_id = '${participantId}' AND question_id = '${questionId}'`,
  )).toMatch(/^0:(t|true)$/);
  expect(pg(`SELECT score::text FROM contest_participants WHERE id = '${participantId}'`)).toBe('0');

  const ranking = await api(request, 'get', `/student/contests/${contestId}/ranking`, { token: studentToken });
  const mine = ranking.body.data.ranking.find((row) => row.participantId === participantId);
  expect(mine.score).toBe(0);
  expect(String(pg(`SELECT score::text FROM contest_participants WHERE id = '${participantId}'`))).toBe(String(mine.score));

  const questions = await api(request, 'get', `/student/contests/${contestId}/questions`, { token: studentToken });
  const watched = questions.body.data.questions.find((row) => row.id === questionId);
  const other = questions.body.data.questions.find((row) => row.id !== questionId);
  expect(watched.invalidated).toBe(true);
  expect(watched.earnedPoints).toBe(0);
  expect(other.invalidated).toBe(false);

  await page.reload();
  await expect(page.getByTestId('fullscreen-gate')).toBeVisible();
  expect(pg(`SELECT status FROM contest_participants WHERE id = '${participantId}'`)).toBe('started');
  const reloaded = await api(request, 'get', `/student/contests/${contestId}/session`, { token: studentToken });
  expect(reloaded.body.data.session.invalidatedQuestionIds).toContain(questionId);
  expect(reloaded.body.data.session.score).toBe(0);

  await page.keyboard.press('Control+Shift+C');
  const browserDeliveredShortcut = await page.waitForURL(new RegExp(`/client/contests/${contestId}$`), { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (!browserDeliveredShortcut) {
    const shortcutDelivered = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'C',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      return window.dispatchEvent(event);
    });
    expect(shortcutDelivered).toBe(false);
    await page.waitForURL(new RegExp(`/client/contests/${contestId}$`));
  }
  await test.step(browserDeliveredShortcut
    ? 'browser delivered Ctrl+Shift+C'
    : 'page KeyboardEvent after the browser kept the chord', async () => {});
  test.info().annotations.push({
    type: 'shortcut',
    description: browserDeliveredShortcut
      ? 'The browser delivered Ctrl+Shift+C to the page.'
      : 'The browser did not navigate on the real Ctrl+Shift+C chord. The page listener was then exercised with a KeyboardEvent.',
  });
  await expect(page.getByText('administrator adds you again')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter Contest' })).toHaveCount(0);
  const rejected = await api(request, 'post', `/student/contests/${contestId}/enter`, {
    token: studentToken,
    data: {},
  });
  expect(rejected.status).toBe(403);
  expect(rejected.body.code).toBe('SESSION_ENDED');
  expect(pg(`SELECT status FROM contest_participants WHERE id = '${participantId}'`)).toBe('exited');
  expect(Number(pg(
    `SELECT COUNT(*) FROM contest_violations WHERE participant_id = '${participantId}'`,
  ))).toBeGreaterThan(0);
  expect(Number(pg(
    `SELECT COUNT(*) FROM participant_question_states WHERE participant_id = '${participantId}' AND invalidated`,
  ))).toBe(1);

  const adminContext = await page.context().browser().newContext();
  const adminPage = await adminContext.newPage();
  await uiLogin(adminPage, ADMIN.email, ADMIN.password);
  await adminPage.goto(`/admin/contests/${contestId}`);
  await adminPage.getByRole('button', { name: 'participants' }).click();
  await expect(adminPage.getByText('Exited', { exact: true })).toBeVisible();
  await adminPage.getByRole('button', { name: 'Re-add' }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Re-add' }).click();
  await expect(adminPage.getByText('Previous scores and submissions were kept.')).toBeVisible();
  expect(pg(`SELECT status || ':' || readd_count::text FROM contest_participants WHERE id = '${participantId}'`)).toBe('started:1');
  await adminContext.close();

  await page.goto(`/client/contests/${contestId}`);
  await expect(page.getByRole('button', { name: 'Enter Contest' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter Contest' }).click();
  await expect(page.getByTestId('fullscreen-gate')).toBeVisible();
  await expect(page.getByText('Remaining')).toBeVisible();
  const restored = await api(request, 'get', `/student/contests/${contestId}/session`, { token: studentToken });
  expect(restored.body.data.session.status).toBe('started');
  expect(restored.body.data.session.invalidatedQuestionIds).toContain(questionId);
});
