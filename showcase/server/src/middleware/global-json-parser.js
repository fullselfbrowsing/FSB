'use strict';

const express = require('express');

function isTelemetryPath(reqPath) {
  return reqPath === '/api/telemetry' || reqPath.startsWith('/api/telemetry/');
}

/**
 * Apply the general 1 MB JSON limit everywhere except telemetry. Telemetry has
 * its own stricter 32 KB parser inside the router; parsing it here first would
 * consume the stream and silently bypass that route-specific limit.
 */
function createGlobalJsonParser() {
  const parser = express.json({ limit: '1mb' });
  return (req, res, next) => isTelemetryPath(req.path) ? next() : parser(req, res, next);
}

module.exports = { createGlobalJsonParser, isTelemetryPath };
