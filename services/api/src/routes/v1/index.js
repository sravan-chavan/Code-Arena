const express = require('express');
const healthRoutes = require('../health.routes');
const authRoutes = require('../../auth/auth.routes');
const adminRoutes = require('../../admin/admin.routes');
const studentRoutes = require('../../student/student.routes');
const config = require('../../config/environment');
const { sendSuccess } = require('../../utils/api-response');
const asyncHandler = require('../../utils/async-handler');

const router = express.Router();

router.get(
  '/',
  asyncHandler((_req, res) =>
    sendSuccess(
      res,
      {
        service: 'api',
        version: 'v1',
        milestone: config.milestone,
        databaseHealth: '/v1/health/db',
      },
      200,
      'CodeArena API v1',
    ),
  ),
);

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/student', studentRoutes);

module.exports = router;
