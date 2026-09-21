const express = require('express');
const studentController = require('./student.controller');
const authenticate = require('../middleware/authentication.middleware');
const requireRole = require('../middleware/authorization.middleware');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../auth/roles');

const router = express.Router();
const requireStudent = [authenticate, requireRole(ROLES.STUDENT)];

router.get('/me', ...requireStudent, asyncHandler(studentController.me));
router.get('/dashboard', ...requireStudent, asyncHandler(studentController.dashboard));

module.exports = router;
