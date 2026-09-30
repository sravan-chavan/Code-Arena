const ADMIN = {
  email: 'admin@codearena.com',
  password: 'Admin@123',
};

async function api(request, method, path, { token, data } = {}) {
  const response = await request[method](`/api${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = await response.json();
  return { status: response.status(), body };
}

async function login(request, email, password) {
  const { status, body } = await api(request, 'post', '/auth/login', {
    data: { email, password },
  });
  if (status !== 200 || !body?.data?.token) {
    throw new Error(`Login failed for ${email}: ${status} ${body?.message || ''}`);
  }
  return body.data.token;
}

async function loginAsAdmin(request) {
  return login(request, ADMIN.email, ADMIN.password);
}

async function uiLogin(page, email, password) {
  await page.goto('/');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Initialize Session' }).click();
}

module.exports = {
  ADMIN,
  api,
  login,
  loginAsAdmin,
  uiLogin,
};
