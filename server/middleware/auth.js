const crypto = require('crypto');
const { getSetting } = require('../db');

// In-memory token store. Intentionally not persisted — tokens are invalidated
// on server restart, which forces the DJ to re-enter their PIN after a redeploy.
const _tokens = new Set();

function issueToken() {
  const token = crypto.randomBytes(32).toString('hex');
  _tokens.add(token);
  return token;
}

/**
 * Express middleware — enforces DJ auth when a PIN is configured.
 *
 * Behaviour:
 *   - No PIN hash in DB  → pass through (open access, matches default behaviour)
 *   - PIN hash in DB     → require "Authorization: Bearer <token>" header
 *                          Token must have been issued by issueToken() (i.e. the
 *                          caller previously verified the PIN via /api/auth/verify-pin)
 *
 * On failure: 401 { error: "Unauthorized" }
 */
function requireDjAuth(req, res, next) {
  const hash = getSetting('dj_pin_hash');
  if (!hash) return next(); // no PIN set — open access

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !_tokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { issueToken, requireDjAuth };
