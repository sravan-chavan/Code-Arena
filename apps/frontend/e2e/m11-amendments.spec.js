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

async function runningContest(request) {
  const adminToken = await loginAsAdmin(request);
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const contest = await api(request, 'post', '/admin/contests', {
    token: adminToken,
    data: {
      title: `E2E Amend ${Date.now()}`,
      description: 'amendment',
      startTime: start,
      endTime: end,
      durationMinutes: 60,
    },
  });
  expect(contest.status).toBe(201);
  const contestId = contest.body.data.contest.id;
  await api(request, 'post', `/admin/contests/${contestId}/questions`, {
    token: adminToken,
    data: {
      title: 'Sum',
      description: 'print the sum',
      testCases: [{ stdin: '1 2', expectedOutput: '3', isHidden: false, points: 10 }],
    },
  });
  const scheduled = await api(request, 'post', `/admin/contests/${contestId}/schedule`, {
    token: adminToken,
    data: {},
  });
  expect(scheduled.body.data.contest.status).toBe('running');
  return { adminToken, contestId };
}

async function makeStudent(request, contestId) {
  const email = `e2e-amend-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const created = await api(request, 'post', '/auth/register', {
    data: { email, password: 'student-pass' },
  });
  expect(created.status).toBe(201);
  const token = await login(request, email, 'student-pass');
  await api(request, 'post', `/student/contests/${contestId}/register`, { token, data: {} });
  return { email, token };
}

test('student can exit from the arena and an admin can re-add them', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { adminToken, contestId } = await runningContest(request);
  const student = await makeStudent(request, contestId);

  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();

  await uiLogin(studentPage, student.email, 'student-pass');
  await studentPage.goto(`/client/contests/${contestId}`);
  await studentPage.getByRole('button', { name: 'Enter Contest' }).click();
  await expect(studentPage.getByText('Remaining')).toBeVisible();
  await studentPage.getByRole('button', { name: 'Exit Contest' }).click();
  await expect(studentPage.getByRole('dialog')).toContainText(
    'Are you sure you want to exit this contest? You will not be able to re-enter unless an administrator adds you again.',
  );
  await studentPage.getByRole('dialog').getByRole('button', { name: 'Exit Contest' }).click();
  await studentPage.waitForURL(new RegExp(`/client/contests/${contestId}$`));
  await expect(studentPage.getByText('administrator adds you again')).toBeVisible();
  await expect(studentPage.getByRole('button', { name: 'Enter Contest' })).toHaveCount(0);

  const rejected = await api(request, 'post', `/student/contests/${contestId}/enter`, {
    token: student.token,
    data: {},
  });
  expect(rejected.status).toBe(403);
  expect(rejected.body.code).toBe('SESSION_ENDED');
  expect(pg(
    `SELECT status FROM contest_participants WHERE contest_id = '${contestId}' AND user_id = (SELECT id FROM users WHERE email = '${student.email}')`,
  )).toBe('exited');

  await uiLogin(adminPage, ADMIN.email, ADMIN.password);
  await adminPage.goto(`/admin/contests/${contestId}`);
  await adminPage.getByRole('button', { name: 'participants' }).click();
  await expect(adminPage.getByText('Exited', { exact: true })).toBeVisible();
  await adminPage.getByRole('button', { name: 'Re-add' }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Re-add' }).click();
  await expect(adminPage.getByText('Previous scores and submissions were kept.')).toBeVisible();
  expect(pg(
    `SELECT status || ':' || readd_count::text FROM contest_participants WHERE contest_id = '${contestId}' AND user_id = (SELECT id FROM users WHERE email = '${student.email}')`,
  )).toBe('started:1');

  await studentPage.goto(`/client/contests/${contestId}`);
  await expect(studentPage.getByRole('button', { name: 'Enter Contest' })).toBeVisible();
  await studentPage.getByRole('button', { name: 'Enter Contest' }).click();
  await expect(studentPage.getByText('Remaining')).toBeVisible();

  await studentContext.close();
  await adminContext.close();
});

test('admin resume keeps exited and removed students out and lets an active student continue', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { adminToken, contestId } = await runningContest(request);
  const active = await makeStudent(request, contestId);
  const exited = await makeStudent(request, contestId);
  const removed = await makeStudent(request, contestId);

  for (const person of [active, exited, removed]) {
    await api(request, 'post', `/student/contests/${contestId}/enter`, { token: person.token, data: {} });
  }
  await api(request, 'post', `/student/contests/${contestId}/exit`, { token: exited.token, data: {} });
  const participants = await api(request, 'get', `/admin/contests/${contestId}/participants`, { token: adminToken });
  const removedRow = participants.body.data.participants.find((row) => row.email === removed.email);
  await api(request, 'post', `/admin/contests/${contestId}/participants/${removedRow.id}/remove`, {
    token: adminToken,
    data: {},
  });

  const studentContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const adminPage = await adminContext.newPage();

  await uiLogin(studentPage, active.email, 'student-pass');
  await studentPage.goto(`/client/contests/${contestId}/arena`);
  await expect(studentPage.getByText('Remaining')).toBeVisible();
  await expect(studentPage.getByTestId('ws-status')).toHaveText('Live', { timeout: 15_000 });

  const ended = await api(request, 'post', `/admin/contests/${contestId}/end`, { token: adminToken, data: {} });
  expect(ended.status).toBe(200);
  expect(ended.body.data.contest.status).toBe('ended');
  await expect(studentPage.getByTestId('contest-lock')).toContainText('This contest has ended.');
  expect(pg(`SELECT status FROM contests WHERE id = '${contestId}'`)).toBe('ended');

  await uiLogin(adminPage, ADMIN.email, ADMIN.password);
  await adminPage.goto(`/admin/contests/${contestId}`);
  await expect(adminPage.getByText('Ended').first()).toBeVisible();
  await adminPage.getByRole('button', { name: 'Resume Contest' }).first().click();
  await expect(adminPage.getByRole('dialog')).toContainText('Resume this contest?');
  await adminPage.getByLabel('Additional time').fill('20');
  const resumeResponse = adminPage.waitForResponse((response) => (
    response.url().includes(`/admin/contests/${contestId}/resume`) && response.request().method() === 'POST'
  ));
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Resume Contest' }).click();
  const resumed = await resumeResponse;
  expect(resumed.status()).toBe(200);
  const resumedBody = await resumed.json();
  expect(resumedBody.data.contest.status).toBe('running');
  await expect(studentPage.getByText('Remaining')).toBeVisible({ timeout: 15_000 });

  expect(pg(`SELECT status FROM contests WHERE id = '${contestId}'`)).toBe('running');
  expect(pg(`SELECT resumed_at IS NOT NULL FROM contests WHERE id = '${contestId}'`)).toBe('t');
  expect(pg(
    `SELECT status FROM contest_participants WHERE contest_id = '${contestId}' AND user_id = (SELECT id FROM users WHERE email = '${exited.email}')`,
  )).toBe('exited');
  expect(pg(
    `SELECT status FROM contest_participants WHERE contest_id = '${contestId}' AND user_id = (SELECT id FROM users WHERE email = '${removed.email}')`,
  )).toBe('removed');

  const exitedEnter = await api(request, 'post', `/student/contests/${contestId}/enter`, {
    token: exited.token,
    data: {},
  });
  expect(exitedEnter.status).toBe(403);
  expect(exitedEnter.body.code).toBe('SESSION_ENDED');
  const removedEnter = await api(request, 'post', `/student/contests/${contestId}/enter`, {
    token: removed.token,
    data: {},
  });
  expect(removedEnter.status).toBe(403);
  expect(removedEnter.body.code).toBe('PARTICIPANT_REMOVED');

  await studentContext.close();
  await adminContext.close();
});

test('login page registers a student and rejects bad input', async ({ page, request }) => {
  test.setTimeout(90_000);
  const email = `e2e-reg-${Date.now()}@example.com`;
  const password = 'student-pass';

  await page.goto('/');
  await page.getByRole('tab', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Create Student Account' })).toBeVisible();

  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByPlaceholder('Confirm password').fill('different-pass');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();

  await page.getByPlaceholder('Email').fill('not-an-email');
  await page.getByPlaceholder('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('email must be a valid email address')).toBeVisible();

  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill('short');
  await page.getByPlaceholder('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('password must be at least 8 characters')).toBeVisible();

  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByPlaceholder('Confirm password').fill(password);
  const created = page.waitForResponse((response) => (
    response.url().includes('/auth/register') && response.request().method() === 'POST'
  ));
  const loggedIn = page.waitForResponse((response) => (
    response.url().includes('/auth/login') && response.request().method() === 'POST'
  ));
  const meResponse = page.waitForResponse((response) => (
    response.url().includes('/auth/me') && response.request().method() === 'GET'
  ));
  await page.getByRole('button', { name: 'Create account' }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const createdBody = await createdResponse.json();
  expect(createdBody.data.user.role).toBe('STUDENT');
  expect((await loggedIn).status()).toBe(200);
  expect((await meResponse).status()).toBe(200);
  await page.waitForURL(/\/client/);
  await expect(page.getByText('Participant Area')).toBeVisible();

  const token = await page.evaluate(() => window.localStorage.getItem('codearena_token'));
  const me = await api(request, 'get', '/auth/me', { token });
  expect(me.status).toBe(200);
  expect(me.body.data.user.role).toBe('STUDENT');
  const studentApi = await api(request, 'get', '/student/contests', { token });
  expect(studentApi.status).toBe(200);
  const adminApi = await api(request, 'get', '/admin/contests', { token });
  expect(adminApi.status).toBe(403);

  await page.goto('/');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByPlaceholder('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Email already registered')).toBeVisible();

  await page.goto('/admin');
  await page.waitForURL(/\/client/);

  const injected = await api(request, 'post', '/auth/register', {
    data: { email: `e2e-admin-${Date.now()}@example.com`, password, role: 'ADMIN' },
  });
  expect(injected.status).toBe(201);
  expect(injected.body.data.user.role).toBe('STUDENT');
});
