const adminService = require('./admin.service');
const { sendSuccess } = require('../utils/api-response');

function me(req, res) {
  return sendSuccess(res, adminService.getMe(req.user), 200);
}

function dashboard(_req, res) {
  return sendSuccess(res, adminService.getDashboard(), 200);
}

module.exports = {
  me,
  dashboard,
};
