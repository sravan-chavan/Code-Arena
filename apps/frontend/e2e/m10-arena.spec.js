const { test, expect } = require('@playwright/test');
const { api, login, loginAsAdmin, uiLogin } = require('./helpers');

test.describe('M10 contest evaluation UI', () => {
  test('enter contest through the API-backed button and show backend timer', async ({ page, request }) => {
    const adminToken = await loginAsAdmin(request);
    const email = `e2e-${Date.now()}@example.com`;
    await api(request, 'post', '/auth/register', {
      data: { email, password: 'student-pass' },
    });
    const studentToken = await login(request, email, 'student-pass');

    const start = new Date(Date.now() + 2_000).toISOString();
    const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const contest = await api(request, 'post', '/admin/contests', {
      token: adminToken,
      data: {
        title: `E2E Arena ${Date.now()}`,
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
        title: 'Add',
        description: 'print the sum',
        testCases: [
          { stdin: '1 2', expectedOutput: '3', isHidden: false, points: 10 },
          { stdin: '4 5', expectedOutput: '9', isHidden: true, points: 20 },
        ],
      },
    });
    await api(request, 'post', `/admin/contests/${contestId}/schedule`, { token: adminToken, data: {} });
    await api(request, 'post', `/student/contests/${contestId}/register`, { token: studentToken, data: {} });

    await page.waitForTimeout(2500);
    await uiLogin(page, email, 'student-pass');
    await page.goto(`/client/contests/${contestId}`);
    await page.getByRole('button', { name: 'Enter Contest' }).click();
    await expect(page.getByText('Remaining')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exit Contest' })).toBeVisible();
    await expect(page.getByText('Ctrl')).toHaveCount(0);

    await page.reload();
    await expect(page.getByText('Remaining')).toBeVisible();
  });
});
