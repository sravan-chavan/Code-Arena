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
router.patch('/contests/:id', ...requireAdmin, asyncHandler(contestController.updateContest));
router.post('/contests/:id/schedule', ...requireAdmin, asyncHandler(contestController.scheduleContest));
router.post('/contests/:id/cancel', ...requireAdmin, asyncHandler(contestController.cancelContest));
router.post('/contests/:id/end', ...requireAdmin, asyncHandler(contestController.endContest));
router.get('/contests/:id/questions', ...requireAdmin, asyncHandler(contestController.listQuestions));
router.post('/contests/:id/questions/batch', ...requireAdmin, asyncHandler(contestController.attachQuestions));
router.post('/contests/:id/questions/:questionId', ...requireAdmin, asyncHandler(contestController.attachQuestion));
router.post('/contests/:id/questions', ...requireAdmin, asyncHandler(contestController.createQuestion));
router.patch('/contests/:id/questions/order', ...requireAdmin, asyncHandler(contestController.reorderQuestions));
router.get('/contests/:id/participants', ...requireAdmin, asyncHandler(contestController.listParticipants));
router.get('/questions', ...requireAdmin, asyncHandler(contestController.listQuestions));
router.post('/questions', ...requireAdmin, asyncHandler(contestController.createLibraryQuestion));
router.get('/questions/:questionId/test-cases', ...requireAdmin, asyncHandler(contestController.listTestCases));
router.post('/questions/:questionId/test-cases', ...requireAdmin, asyncHandler(contestController.createTestCase));
router.patch('/questions/:questionId/test-cases/:testCaseId', ...requireAdmin, asyncHandler(contestController.updateTestCase));
router.delete('/questions/:questionId/test-cases/:testCaseId', ...requireAdmin, asyncHandler(contestController.deleteTestCase));
router.get('/questions/:questionId', ...requireAdmin, asyncHandler(contestController.getQuestion));
router.patch('/questions/:questionId', ...requireAdmin, asyncHandler(contestController.updateQuestion));

module.exports = router;
