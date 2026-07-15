const crypto = require('crypto');
const express = require('express');

const PAIR_ERROR_CODES = Object.freeze({
  GENERATE_FAILED: 'pair_generate_failed',
  TOKEN_REQUIRED: 'pair_token_required',
  TOKEN_INVALID_OR_EXPIRED: 'pair_token_invalid_or_expired',
  TOKEN_ALREADY_USED: 'pair_token_already_used',
  TOKEN_EXPIRED: 'pair_token_expired',
  EXCHANGE_FAILED: 'pair_exchange_failed',
  SESSION_TOKEN_REQUIRED: 'pair_session_token_required',
  SESSION_INVALID: 'pair_session_invalid',
  SESSION_EXPIRED: 'pair_session_expired'
});

function sendPairError(res, status, code, error) {
  return res.status(status).json({ error, code });
}

function createPairRouter(queries, authMiddleware) {
  const router = express.Router();

  // POST /api/pair/generate - Generate a one-time pairing token
  // Requires X-FSB-Hash-Key header (authenticated)
  router.post('/generate', authMiddleware, (req, res) => {
    try {
      const hashKey = req.hashKey;

      // Clean expired tokens opportunistically
      queries.cleanExpiredPairingTokens();

      // Invalidate existing unused tokens for this hash key
      queries.invalidatePairingTokens(hashKey);

      // Generate new one-time token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60000).toISOString(); // 60 seconds

      queries.createPairingToken(token, hashKey, expiresAt);

      res.json({ token, expiresAt });
    } catch (error) {
      console.error('Failed to generate pairing token:', error.message);
      sendPairError(
        res,
        500,
        PAIR_ERROR_CODES.GENERATE_FAILED,
        'Failed to generate pairing token'
      );
    }
  });

  // POST /api/pair/exchange - Exchange pairing token for session token
  // No auth header needed - the token IS the auth
  router.post('/exchange', (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return sendPairError(res, 400, PAIR_ERROR_CODES.TOKEN_REQUIRED, 'Token required');
      }

      const record = queries.getPairingToken(token);
      if (!record) {
        return sendPairError(
          res,
          404,
          PAIR_ERROR_CODES.TOKEN_INVALID_OR_EXPIRED,
          'Invalid or expired token'
        );
      }

      if (record.used) {
        return sendPairError(
          res,
          410,
          PAIR_ERROR_CODES.TOKEN_ALREADY_USED,
          'Token already used'
        );
      }

      const now = new Date();
      if (new Date(record.expires_at) < now) {
        return sendPairError(res, 410, PAIR_ERROR_CODES.TOKEN_EXPIRED, 'Token expired');
      }

      // Mark token as used, generate session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

      queries.consumePairingToken(token, sessionToken, sessionExpiresAt);

      res.json({
        hashKey: record.hash_key,
        sessionToken,
        expiresAt: sessionExpiresAt
      });
    } catch (error) {
      console.error('Failed to exchange pairing token:', error.message);
      sendPairError(
        res,
        500,
        PAIR_ERROR_CODES.EXCHANGE_FAILED,
        'Failed to exchange token'
      );
    }
  });

  // GET /api/pair/validate - Validate a session token
  router.get('/validate', (req, res) => {
    const sessionToken = req.headers['x-fsb-session-token'];
    if (!sessionToken) {
      return res.json({ valid: false, code: PAIR_ERROR_CODES.SESSION_TOKEN_REQUIRED });
    }

    const record = queries.getSessionByToken(sessionToken);
    if (!record) return res.json({ valid: false, code: PAIR_ERROR_CODES.SESSION_INVALID });

    // Check session expiry
    if (record.session_expires_at && new Date(record.session_expires_at) < new Date()) {
      return res.json({
        valid: false,
        reason: 'expired',
        code: PAIR_ERROR_CODES.SESSION_EXPIRED
      });
    }

    res.json({
      valid: true,
      hashKey: record.hash_key,
      expiresAt: record.session_expires_at
    });
  });

  // POST /api/pair/revoke - Revoke a session
  router.post('/revoke', (req, res) => {
    const sessionToken = req.headers['x-fsb-session-token'];
    if (!sessionToken) {
      return sendPairError(
        res,
        400,
        PAIR_ERROR_CODES.SESSION_TOKEN_REQUIRED,
        'Session token required'
      );
    }

    queries.revokeSession(sessionToken);
    res.json({ revoked: true });
  });

  return router;
}

module.exports = createPairRouter;
module.exports.PAIR_ERROR_CODES = PAIR_ERROR_CODES;
