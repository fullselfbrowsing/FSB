'use strict';

/**
 * Phase 34 (UPLOAD-04) -- sensitive-path denylist unit test.
 *
 * The denylist is the security backstop for upload_file (posture A): it runs at
 * the shared background chokepoint so neither front door (MCP / autopilot) can
 * upload a secret. Pure string policy, so fully node-testable.
 *
 * Run: node tests/upload-path-denylist.test.js
 */

const denylist = require('../extension/utils/upload-path-denylist.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed += 1; console.log('  PASS:', msg); }
  else { failed += 1; console.error('  FAIL:', msg); }
}

console.log('\n--- upload-path-denylist (Phase 34) ---');

// --- denied: sensitive directories ---
check(denylist.isDenied('/Users/me/.ssh/id_rsa'), '~/.ssh/id_rsa is denied');
check(denylist.isDenied('/Users/me/.aws/credentials'), '~/.aws/credentials is denied');
check(denylist.isDenied('/home/u/.gnupg/secring.gpg'), '~/.gnupg/* is denied');
check(denylist.isDenied('/Users/me/Library/Keychains/login.keychain-db'), 'macOS keychain is denied');
check(denylist.isDenied('/home/u/.fsb-vault/keys.json'), 'FSB vault is denied');

// --- denied: sensitive filenames / prefixes ---
check(denylist.isDenied('/home/u/project/.env'), '.env is denied');
check(denylist.isDenied('/home/u/project/.env.production'), '.env.production is denied');
check(denylist.isDenied('/srv/app/id_ed25519'), 'id_ed25519 is denied');
check(denylist.isDenied('/home/u/.npmrc'), '.npmrc is denied');

// --- denied: secret extensions ---
check(denylist.isDenied('/home/u/certs/server.pem'), '*.pem is denied');
check(denylist.isDenied('/home/u/certs/server.key'), '*.key is denied');
check(denylist.isDenied('/home/u/vault.kdbx'), '*.kdbx is denied');

// --- denied: system secret stores ---
check(denylist.isDenied('/etc/shadow'), '/etc/shadow is denied');
check(denylist.isDenied('/etc/ssl/private/server.crt'), '/etc/ssl/private/* is denied');

// --- case-insensitive ---
check(denylist.isDenied('/Users/Me/.SSH/ID_RSA'), 'denylist is case-insensitive');

// --- WR-01: Win32 trailing dot/space cannot bypass (resolves to the real file) ---
check(denylist.isDenied('/Users/me/proj/id_rsa '), 'trailing-space basename cannot bypass');
check(denylist.isDenied('/Users/me/proj/credentials.'), 'trailing-dot basename cannot bypass');
check(denylist.isDenied('C:\\proj\\server.pem '), 'trailing-space secret extension cannot bypass');

// --- WR-02: additional sensitive files / dirs ---
check(denylist.isDenied('/Users/me/.git-credentials'), '.git-credentials denied');
check(denylist.isDenied('/home/u/.bash_history'), '.bash_history denied');
check(denylist.isDenied('/var/run/secrets/kubernetes.io/serviceaccount/token'), 'k8s service-account token dir denied');
check(denylist.isDenied('/proc/self/environ'), '/proc/* denied (env-var leak)');
check(!denylist.isDenied('/Users/me/process-notes/report.pdf'), '/process-* is NOT mistaken for /proc/');

// --- allowed: ordinary uploadable files ---
check(!denylist.isDenied('/Users/me/Documents/resume.pdf'), 'resume.pdf is allowed');
check(!denylist.isDenied('/Users/me/Pictures/photo.png'), 'photo.png is allowed');
check(!denylist.isDenied('/tmp/report.docx'), 'report.docx is allowed');
check(!denylist.isDenied('/Users/me/Downloads/invoice.xlsx'), 'invoice.xlsx is allowed');

// --- reasons are content-free tokens (safe to audit, no path echoed) ---
check(denylist.classify('/Users/me/.ssh/id_rsa').reason === 'sensitive-directory', 'dir reason token');
check(denylist.classify('/home/u/certs/server.pem').reason === 'secret-extension', 'extension reason token');
check(denylist.classify('/home/u/Documents/resume.pdf').reason === '', 'allowed reason is empty');

// --- absolute-path gate ---
check(denylist.isAbsolutePath('/Users/me/a.pdf'), 'POSIX absolute path recognized');
check(denylist.isAbsolutePath('C:\\Users\\me\\a.pdf'), 'Windows absolute path recognized');
check(!denylist.isAbsolutePath('relative/a.pdf'), 'relative path rejected');
check(!denylist.isAbsolutePath('~/a.pdf'), 'tilde path rejected (SW cannot expand ~)');

// --- basename helper (cross-platform) ---
check(denylist.basenameOf('/a/b/c.txt') === 'c.txt', 'basenameOf posix');
check(denylist.basenameOf('C:\\Users\\me\\id_rsa') === 'id_rsa', 'basenameOf windows');

console.log(`\nupload-path-denylist: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
