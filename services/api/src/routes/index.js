const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('../auth/auth.routes');
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

/** Versioned API surface: /v1/... (external /api/v1/... via Nginx) */
router.use('/v1', v1Routes);

module.exports = router;
