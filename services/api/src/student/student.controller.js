const studentService = require('./student.service');
const { sendSuccess } = require('../utils/api-response');

function me(req, res) {
  return sendSuccess(res, studentService.getMe(req.user), 200);
}

function dashboard(_req, res) {
  return sendSuccess(res, studentService.getDashboard(), 200);
}

module.exports = {
  me,
  dashboard,
};
