/**
 * Phase 273 / INGEST-03 + D-09 -- HMAC-SHA256 of plaintext IP with daily-rotated salt.
 *
 * PRIVACY INVARIANT (per CONTEXT D-09 + INGEST-13):
 *   - plaintextIp is accepted as a function argument
 *   - immediately passed to crypto.createHmac().update() and discarded
 *   - NEVER assigned to a module-level or long-lived variable
 *   - NEVER logged, NEVER written to disk, NEVER passed onward
 *   - the temporary `plaintextIp` parameter is the only place plaintext exists,
 *     and it leaves scope as soon as this function returns
 *
 * tests/server-no-ip-leak.test.js audits all .js files under showcase/server/src/
 * recursively for any pattern that would violate this invariant.
 *
 * The daily salt is fetched via getOrMintTodaySalt(db) -- lazy UTC-daily rotation;
 * see src/utils/telemetry-salt.js.
 */

'use strict';

const crypto = require('crypto');
const { getOrMintTodaySalt } = require('./telemetry-salt');

/**
 * HMAC-SHA256(plaintextIp, todaysSalt) -> 64-char hex string.
 *
 * @param {string} plaintextIp request IP (clientIp(req): Fly-Client-IP, else req.ip)
 * @param {Database} db better-sqlite3 instance
 * @returns {string} 64-char hex digest
 */
function hashIp(plaintextIp, db) {
  const { salt_hex } = getOrMintTodaySalt(db);
  const key = Buffer.from(salt_hex, 'hex');
  return crypto.createHmac('sha256', key).update(String(plaintextIp), 'utf8').digest('hex');
}

// UUIDv4 shape: 8-4-4-4-12 hex with version=4 nibble + variant bits 10xx in clock_seq_hi.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Strict UUIDv4 shape check.
 * @param {unknown} str
 * @returns {boolean}
 */
function isValidUuidV4(str) {
  return typeof str === 'string' && UUID_V4_RE.test(str);
}

module.exports = { hashIp, isValidUuidV4 };
