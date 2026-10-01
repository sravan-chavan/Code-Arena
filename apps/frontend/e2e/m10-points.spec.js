const { test, expect } = require('@playwright/test');
const { loginAsAdmin, uiLogin, ADMIN, api } = require('./helpers');

test.describe('M10 test-case points', () => {
  test('admin default points persist after edit and refresh', async ({ page, request }) => {
    const token = await loginAsAdmin(request);
    const title = `E2E Points ${Date.now()}`;
    const created = await api(request, 'post', '/admin/questions', {
      token,
      data: {
        title,
        description: 'points e2e',
        difficulty: 'easy',
        testCases: [{ stdin: '1', expectedOutput: '1', isHidden: false }],
      },
    });
    expect(created.status).toBe(201);
    const question = created.body.data.question;
    expect(question.testCases[0].points).toBe(10);
    expect(question.totalPoints).toBe(10);

    await uiLogin(page, ADMIN.email, ADMIN.password);
    await page.goto('/admin/questions');
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByRole('button', { name: /Test Cases/ }).first().click();
    await expect(page.getByText('Test Case 1 · 10 pts')).toBeVisible();

    const added = await api(request, 'post', `/admin/questions/${question.id}/test-cases`, {
      token,
      data: { stdin: '2', expectedOutput: '2', isHidden: false },
    });
    expect(added.status).toBe(201);
    expect(added.body.data.testCase.points).toBe(10);

    const patched = await api(request, 'patch', `/admin/questions/${question.id}/test-cases/${question.testCases[0].id}`, {
      token,
      data: { points: 20 },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.testCase.points).toBe(20);

    const loaded = await api(request, 'get', `/admin/questions/${question.id}`, { token });
    expect(loaded.body.data.question.totalPoints).toBe(30);

    await page.reload();
    await page.getByText(title).click();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByRole('button', { name: /Test Cases/ }).first().click();
    await expect(page.getByText('Test Case 1 · 20 pts')).toBeVisible();
  });
});
