const express = require('express');
const studentController = require('./student.controller');
const contestController = require('./student.contest.controller');
const practiceController = require('./student.practice.controller');
const authenticate = require('../middleware/authentication.middleware');
const requireRole = require('../middleware/authorization.middleware');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../auth/roles');

const router = express.Router();
const requireStudent = [authenticate, requireRole(ROLES.STUDENT)];

router.get('/me', ...requireStudent, asyncHandler(studentController.me));
router.get('/dashboard', ...requireStudent, asyncHandler(studentController.dashboard));
router.get('/languages', ...requireStudent, asyncHandler(contestController.languages));
router.get('/practice/problems', ...requireStudent, asyncHandler(practiceController.listProblems));
router.get('/practice/problems/:id', ...requireStudent, asyncHandler(practiceController.getProblem));
router.post('/practice/executions', ...requireStudent, asyncHandler(practiceController.createExecution));
router.get('/practice/submissions', ...requireStudent, asyncHandler(practiceController.listSubmissions));
router.get('/practice/submissions/:id', ...requireStudent, asyncHandler(practiceController.getSubmission));
router.get('/contests', ...requireStudent, asyncHandler(contestController.listContests));
router.get('/contests/:id', ...requireStudent, asyncHandler(contestController.getContest));
router.post('/contests/:id/register', ...requireStudent, asyncHandler(contestController.register));
router.get('/contests/:id/registration', ...requireStudent, asyncHandler(contestController.getRegistration));
router.post('/contests/:id/enter', ...requireStudent, asyncHandler(contestController.enter));
router.get('/contests/:id/session', ...requireStudent, asyncHandler(contestController.getSession));
router.post('/contests/:id/exit', ...requireStudent, asyncHandler(contestController.exit));
router.post('/contests/:id/current-question', ...requireStudent, asyncHandler(contestController.setCurrentQuestion));
router.post('/contests/:id/violations', ...requireStudent, asyncHandler(contestController.reportViolation));
router.get('/contests/:id/ranking', ...requireStudent, asyncHandler(contestController.ranking));
router.get('/contests/:id/submissions', ...requireStudent, asyncHandler(contestController.listContestSubmissions));
router.get('/contests/:id/questions', ...requireStudent, asyncHandler(contestController.listQuestions));
router.get('/contests/:id/questions/:questionId', ...requireStudent, asyncHandler(contestController.getQuestion));
router.post('/executions', ...requireStudent, asyncHandler(contestController.createExecution));
router.get('/submissions', ...requireStudent, asyncHandler(contestController.listSubmissions));
router.get('/submissions/:id', ...requireStudent, asyncHandler(contestController.getSubmission));

module.exports = router;
