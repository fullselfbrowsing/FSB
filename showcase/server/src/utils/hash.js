/**
 * Validate a hash key format (64-char hex string)
 * @param {string} key
 * @returns {boolean}
 */
function isValidHashKeyFormat(key) {
  return typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
}

module.exports = { isValidHashKeyFormat };
