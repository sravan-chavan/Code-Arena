const express = require('express');
const healthRoutes = require('./health.routes');
const v1Routes = require('./v1');

const router = express.Router();

/**
 * Compatibility health path for Milestone 0 Docker / Nginx checks.
 * External: GET /api/health → Nginx strips /api → GET /health
 * Direct:   GET /health (Compose healthcheck)
 */
router.use('/health', healthRoutes);

/** Versioned API surface: /v1/... (external /api/v1/... via Nginx) */
router.use('/v1', v1Routes);

module.exports = router;
