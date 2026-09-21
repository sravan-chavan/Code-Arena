const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('../auth/auth.routes');
const adminRoutes = require('../admin/admin.routes');
const studentRoutes = require('../student/student.routes');
const v1Routes = require('./v1');

const router = express.Router();

/**
 * Compatibility health path for Milestone 0 Docker / Nginx checks.
 * External: GET /api/health → Nginx strips /api → GET /health
 * Direct:   GET /health (Compose healthcheck)
 */
router.use('/health', healthRoutes);

/**
 * Authentication: /auth/...
 * External via Nginx: /api/auth/register|login|me
 */
router.use('/auth', authRoutes);

/**
 * Admin application APIs.
 * External via Nginx: /api/admin/me|dashboard
 */
router.use('/admin', adminRoutes);

/**
 * Participant application APIs.
 * External via Nginx: /api/student/me|dashboard
 */
router.use('/student', studentRoutes);

/** Versioned API surface: /v1/... (external /api/v1/... via Nginx) */
router.use('/v1', v1Routes);

module.exports = router;
