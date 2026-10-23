const adminUserService = require('./admin.user.service');
const { sendSuccess } = require('../utils/api-response');

async function listUsers(req, res) {
  const result = await adminUserService.listUsers(req.query);
  return sendSuccess(res, result, 200);
}

async function countUsers(_req, res) {
  const result = await adminUserService.countUsers();
  return sendSuccess(res, result, 200);
}

async function registerUser(req, res) {
  const result = await adminUserService.registerStudent(req.body);
  return sendSuccess(res, result, 201, 'Registration successful');
}

module.exports = {
  listUsers,
  countUsers,
  registerUser,
};
