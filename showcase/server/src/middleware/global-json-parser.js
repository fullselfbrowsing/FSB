'use strict';

const express = require('express');

// Express mounts routers case-insensitively by default, so /API/JEV/decide
// reaches the Jev router. The skip checks compare case-insensitively too, or
// a case variant would be parsed here first and bypass the route-local cap
// and error handler.
function isTelemetryPath(reqPath) {
  const p = String(reqPath).toLowerCase();
  return p === '/api/telemetry' || p.startsWith('/api/telemetry/');
}

function isJevPath(reqPath) {
  const p = String(reqPath).toLowerCase();
  return p === '/api/jev' || p.startsWith('/api/jev/');
}

/**
 * Apply the general 1 MB JSON limit everywhere except telemetry and Jev. Both
 * routers own stricter route-local parsers (telemetry 32 KB, Jev 48 KB) and
 * their own error handlers; parsing here first would consume the stream and
 * silently bypass those route-specific limits.
 */
function createGlobalJsonParser() {
  const parser = express.json({ limit: '1mb' });
  return (req, res, next) => (isTelemetryPath(req.path) || isJevPath(req.path) ? next() : parser(req, res, next));
}

module.exports = { createGlobalJsonParser, isTelemetryPath, isJevPath };
