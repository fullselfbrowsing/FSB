// extension/utils/upload-path-denylist.js
// Phase 34 (UPLOAD-04) -- sensitive-path denylist for the upload_file tool.
//
// Security posture A: block uploading well-known sensitive files/dirs (private
// keys, credential stores, env files, keychains, the FSB vault) to web forms.
// This is a PURE string policy (no filesystem access) so it runs at the shared
// background chokepoint reached by BOTH front doors (MCP + autopilot), and the
// guarantee cannot be bypassed by one path. Dual-export IIFE, zero deps. The
// reason tokens are content-free (no path echoed) so they are safe to audit.
//
// Posture: denylist (block sensitive), not allowlist. It is a backstop against
// an agent being talked into exfiltrating a secret, NOT a complete sandbox.
(function (global) {
  'use strict';

  // Directory segments that must never be uploaded (matched anywhere in path).
  var DENY_DIR_SEGMENTS = [
    '/.ssh/', '/.aws/', '/.gnupg/', '/.gpg/', '/.kube/', '/.docker/',
    '/.config/gcloud/', '/.config/gh/', '/.azure/', '/.password-store/',
    '/library/keychains/', '/.local/share/keyrings/', '/var/run/secrets/',
    '/.fsb/', '/.fsb-vault/'
  ];

  // Exact basenames that must never be uploaded.
  var DENY_BASENAMES = [
    '.env', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '.netrc', '.pgpass',
    '.npmrc', '.pypirc', 'credentials', 'shadow', 'sudoers', 'secrets.json',
    'wallet.dat', '.git-credentials', '.dockercfg', '.bash_history', '.zsh_history'
  ];

  // Basename prefixes (e.g. ".env.local", ".env.production").
  var DENY_BASENAME_PREFIXES = ['.env.'];

  // Extensions that are almost always secret material.
  var DENY_SUFFIXES = ['.pem', '.key', '.p12', '.pfx', '.keystore', '.jks', '.asc', '.kdbx'];

  // Absolute system secret stores.
  var DENY_ABS_PREFIXES = ['/etc/ssl/private/', '/etc/shadow', '/etc/sudoers', '/proc/'];

  function normalize(p) {
    return String(p == null ? '' : p).replace(/\\+/g, '/');
  }

  function basenameOf(p) {
    var s = normalize(p).replace(/\/+$/, '');
    var parts = s.split('/');
    var base = parts[parts.length - 1] || '';
    // Win32 strips trailing dots/spaces, so "id_rsa " / "credentials." resolve to
    // the real secret file; strip them so they cannot bypass the basename/suffix
    // gates (a genuine exfiltration bypass on Windows otherwise).
    return base.replace(/[ .]+$/, '');
  }

  function endsWith(s, suffix) {
    return s.length >= suffix.length && s.lastIndexOf(suffix) === s.length - suffix.length;
  }

  /**
   * Classify an absolute file path for upload eligibility.
   * @param {string} filePath
   * @returns {{denied: boolean, reason: string}} reason is a content-free token.
   */
  function classify(filePath) {
    var lower = normalize(filePath).toLowerCase();
    var baseLower = basenameOf(filePath).toLowerCase();

    for (var a = 0; a < DENY_ABS_PREFIXES.length; a++) {
      if (lower.indexOf(DENY_ABS_PREFIXES[a]) === 0) return { denied: true, reason: 'system-secret-store' };
    }
    for (var d = 0; d < DENY_DIR_SEGMENTS.length; d++) {
      if (lower.indexOf(DENY_DIR_SEGMENTS[d]) !== -1) return { denied: true, reason: 'sensitive-directory' };
    }
    for (var b = 0; b < DENY_BASENAMES.length; b++) {
      if (baseLower === DENY_BASENAMES[b]) return { denied: true, reason: 'sensitive-filename' };
    }
    for (var p = 0; p < DENY_BASENAME_PREFIXES.length; p++) {
      if (baseLower.indexOf(DENY_BASENAME_PREFIXES[p]) === 0) return { denied: true, reason: 'sensitive-filename' };
    }
    for (var s = 0; s < DENY_SUFFIXES.length; s++) {
      if (endsWith(baseLower, DENY_SUFFIXES[s])) return { denied: true, reason: 'secret-extension' };
    }
    return { denied: false, reason: '' };
  }

  function isDenied(filePath) {
    return classify(filePath).denied;
  }

  // Is this a usable absolute path? (CDP setFileInputFiles needs absolute paths;
  // the background SW cannot expand ~ or resolve relative paths.)
  function isAbsolutePath(filePath) {
    var s = normalize(filePath);
    if (!s) return false;
    if (s.charAt(0) === '/') return true;              // POSIX
    if (/^[A-Za-z]:\//.test(s)) return true;           // Windows drive
    return false;
  }

  // Test seam (mirrors service-denylist._setForTest conventions).
  function _setForTest(overrides) {
    if (!overrides) return;
    if (Array.isArray(overrides.dirSegments)) DENY_DIR_SEGMENTS = overrides.dirSegments;
    if (Array.isArray(overrides.basenames)) DENY_BASENAMES = overrides.basenames;
    if (Array.isArray(overrides.suffixes)) DENY_SUFFIXES = overrides.suffixes;
  }

  var exportsObj = {
    classify: classify,
    isDenied: isDenied,
    isAbsolutePath: isAbsolutePath,
    basenameOf: basenameOf,
    _setForTest: _setForTest
  };

  global.FsbUploadPathDenylist = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})(typeof globalThis !== 'undefined' ? globalThis : this);
