const express = require('express');
const adminController = require('./admin.controller');
const contestController = require('./admin.contest.controller');
const authenticate = require('../middleware/authentication.middleware');
const requireRole = require('../middleware/authorization.middleware');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../auth/roles');

const router = express.Router();
const requireAdmin = [authenticate, requireRole(ROLES.ADMIN)];

router.get('/me', ...requireAdmin, asyncHandler(adminController.me));
router.get('/dashboard', ...requireAdmin, asyncHandler(adminController.dashboard));
router.get('/contests', ...requireAdmin, asyncHandler(contestController.listContests));
router.post('/contests', ...requireAdmin, asyncHandler(contestController.createContest));
router.get('/contests/:id', ...requireAdmin, asyncHandler(contestController.getContest));
router.get('/contests/:id/questions', ...requireAdmin, asyncHandler(contestController.listQuestions));
router.post('/contests/:id/questions', ...requireAdmin, asyncHandler(contestController.createQuestion));
router.get('/questions', ...requireAdmin, asyncHandler(contestController.listQuestions));
router.get('/questions/:questionId', ...requireAdmin, asyncHandler(contestController.getQuestion));

module.exports = router;
