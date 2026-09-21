const authService = require('./auth.service');
const { sendSuccess } = require('../utils/api-response');

async function register(req, res) {
  const result = await authService.register({
    email: req.body.email,
    password: req.body.password,
  });
  return sendSuccess(res, result, 201, 'Registration successful');
}

async function login(req, res) {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });
  return sendSuccess(res, result, 200, 'Login successful');
}

async function me(req, res) {
  const result = await authService.getMe(req.user.id);
  return sendSuccess(res, result, 200);
}

module.exports = {
  register,
  login,
  me,
};
