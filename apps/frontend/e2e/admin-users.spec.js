const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { api, loginAsAdmin, uiLogin, ADMIN } = require('./helpers');

function pg(sql) {
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
  const args = [
    'exec',
    'codearena-postgres',
    'psql',
    '-U',
    vars.POSTGRES_USER || 'codearena',
    '-d',
    vars.POSTGRES_DB || 'codearena',
    '-t',
    '-A',
    '-c',
    sql,
  ];
  try {
    return execFileSync('docker', args, { encoding: 'utf8' }).trim();
  } catch (err) {
    const text = `${err && err.stderr ? err.stderr : ''}${err && err.message ? err.message : ''}`;
    if (!text.includes('dockerDesktopLinuxEngine') && !text.includes('npipe')) {
      throw err;
    }
    return execFileSync('wsl', ['-e', 'docker', ...args], { encoding: 'utf8' }).trim();
  }
}

test('administrator dashboard count opens user management and registration persists', async ({ page, request }) => {
  test.setTimeout(120000);
  const email = `admin-ui-${Date.now()}@example.com`;
  const password = 'student-pass';
  try {
  const adminToken = await loginAsAdmin(request);
  const before = await api(request, 'get', '/admin/users/count', { token: adminToken });
  expect(before.status).toBe(200);
  const startingTotal = before.body.data.totalUsers;
  expect(Number.isInteger(startingTotal)).toBe(true);

  await uiLogin(page, ADMIN.email, ADMIN.password);
  const card = page.getByTestId('total-users-card');
  await expect(card).toContainText('Total Users');
  await expect(card).toContainText(String(startingTotal));
  await expect(card).not.toContainText('Active Users');
  await expect(page.getByText('Workers Online')).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Participant Management' })).toBeVisible();
  await expect(page.getByTestId('total-users')).toHaveText(String(startingTotal));
  await expect(page.getByText('Aarav Sharma')).toHaveCount(0);
  await expect(page.getByText('Dr. Rajesh Kumar')).toHaveCount(0);
  await page.getByLabel('Search users by email').fill(ADMIN.email);
  await expect(page.getByRole('cell', { name: ADMIN.email })).toBeVisible();
  await expect(page.getByTestId('matching-users')).toHaveText('1');

  await page.getByRole('button', { name: 'Register User' }).click();
  await page.getByLabel('Email', { exact: true }).fill('not-an-email');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create student account' }).click();
  await expect(page.getByText('email must be a valid email address')).toBeVisible();
  await expect(page.getByText('password must be at least 8 characters')).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill('different-pass');
  await page.getByRole('button', { name: 'Create student account' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();

  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create student account' }).click();
  await expect(page.getByRole('status')).toContainText(`Student account created for ${email}.`);
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByTestId('total-users')).toHaveText(String(startingTotal + 1));

  const storedHash = pg(`SELECT password_hash FROM users WHERE email = '${email}'`);
  expect(storedHash.startsWith('$2')).toBe(true);
  expect(storedHash).not.toBe(password);
  expect(pg(`SELECT role FROM users WHERE email = '${email}'`)).toBe('STUDENT');

  const studentLogin = await api(request, 'post', '/auth/login', { data: { email, password } });
  expect(studentLogin.status).toBe(200);
  expect(studentLogin.body.data.user.role).toBe('STUDENT');
  const studentToken = studentLogin.body.data.token;

  await page.getByRole('button', { name: 'Register User' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create student account' }).click();
  await expect(page.getByText('Email already registered')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('total-users')).toHaveText(String(startingTotal + 1));

  await page.getByLabel('Search users by email').fill(email);
  await expect(page.getByTestId('matching-users')).toHaveText('1');
  await page.getByLabel('Filter by role').selectOption('ADMIN');
  await expect(page.getByText('No users found matching your criteria.')).toBeVisible();
  await page.getByLabel('Filter by role').selectOption('all');
  await page.getByLabel('Search users by email').fill('');

  await page.goto('/admin');
  await expect(page.getByTestId('dashboard-total-users')).toHaveText(String(startingTotal + 1));

  const deniedList = await api(request, 'get', '/admin/users', { token: studentToken });
  const deniedCount = await api(request, 'get', '/admin/users/count', { token: studentToken });
  const deniedCreate = await api(request, 'post', '/admin/users', {
    token: studentToken,
    data: { email: `blocked-${Date.now()}@example.com`, password },
  });
  expect(deniedList.status).toBe(403);
  expect(deniedCount.status).toBe(403);
  expect(deniedCreate.status).toBe(403);

  await page.getByRole('button', { name: 'Logout' }).click();
  await uiLogin(page, email, password);
  await expect(page).toHaveURL(/\/client/);
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Register User' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/client/);
  } finally {
    pg(`DELETE FROM users WHERE email = '${email}'`);
  }
});

test('users page shows an API error instead of mock people', async ({ page }) => {
  await uiLogin(page, ADMIN.email, ADMIN.password);
  await page.route('**/api/admin/users?*', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Database unavailable' }),
  }));
  await page.goto('/admin/users');
  await expect(page.getByRole('alert')).toContainText('Database unavailable');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByTestId('total-users')).toHaveText('—');
  await expect(page.getByText('Aarav Sharma')).toHaveCount(0);
});

test('dashboard user card shows an error instead of the mock count', async ({ page }) => {
  await uiLogin(page, ADMIN.email, ADMIN.password);
  await page.route('**/api/admin/users/count', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Count failed' }),
  }));
  await page.goto('/admin');
  const card = page.getByTestId('total-users-card');
  await expect(card).toContainText('—');
  await expect(card).toContainText('Count failed');
  await expect(page.getByTestId('dashboard-total-users')).not.toHaveText('5');
  await expect(page.getByText('Workers Online')).toBeVisible();
});

test('users page shows a loading state before the API responds', async ({ page }) => {
  await uiLogin(page, ADMIN.email, ADMIN.password);
  await page.route('**/api/admin/users?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto('/admin/users');
  await expect(page.getByText('Loading users…')).toBeVisible();
  await expect(page.getByTestId('total-users')).not.toHaveText('…');
  await expect(page.getByTestId('total-users')).not.toHaveText('—');
});
