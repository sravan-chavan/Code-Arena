const express = require('express');
const adminController = require('./admin.controller');
const authenticate = require('../middleware/authentication.middleware');
const requireRole = require('../middleware/authorization.middleware');
const asyncHandler = require('../utils/async-handler');
const { ROLES } = require('../auth/roles');

const router = express.Router();
const requireAdmin = [authenticate, requireRole(ROLES.ADMIN)];

router.get('/me', ...requireAdmin, asyncHandler(adminController.me));
router.get('/dashboard', ...requireAdmin, asyncHandler(adminController.dashboard));

module.exports = router;
