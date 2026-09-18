/**
 * Resolve the connecting client IP for anonymous telemetry (hash + geo).
 *
 * Fly Proxy always sets `Fly-Client-IP` to the TCP peer it accepted. Express
 * `trust proxy: 1` walks X-Forwarded-For from the right and, on Fly, lands on
 * the app's shared/anycast address (SJC → US-CA) or a 6PN IPv6 (unparseable
 * as IPv4 → 'unknown'). Production evidence: every retained day collapsed onto
 * exactly two ip_hash values, each pinned at the per-IP UUID cap of 20.
 *
 * PRIVACY: the returned string is plaintext IP. Callers must pass it straight
 * into hashIp / deriveRegion and MUST NOT assign it to a long-lived binding,
 * log it, or persist it. This helper itself retains nothing.
 */

'use strict';

/**
 * @param {import('express').Request|null|undefined} req
 * @returns {string}
 */
function clientIp(req) {
  if (!req) return '';
  const fly = typeof req.get === 'function' ? req.get('Fly-Client-IP') : '';
  if (typeof fly === 'string') {
    const trimmed = fly.trim();
    if (trimmed) return trimmed;
  }
  return typeof req.ip === 'string' ? req.ip : '';
}

module.exports = { clientIp };
