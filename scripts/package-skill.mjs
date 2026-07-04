#!/usr/bin/env node
// Package the FSB OpenClaw + Hermes skill at skills/fsb/ into a publishable
// zip artifact at dist/skill/FSB-Skill-<version>.zip. Reproducible build:
// runs from a clean working tree, includes only files under skills/fsb/,
// excludes any node_modules or hidden files, and stamps the version from
// SKILL.md frontmatter.
//
// Note: the source directory is `skills/fsb/` (renamed in
// QUICK-260520-gi0; the prior dirname used a space + uppercase). The output
// zip filename is intentionally kept as `FSB-Skill-<version>.zip` so existing
// ClawHub publish consumers and any hard-coded download URLs do not break.
//
// Usage: npm run package:skill
//
// This script does NOT publish to ClawHub. Publish is user-gated:
//   clawhub login
//   clawhub publish "skills/fsb"
//
// See .planning/v0.9.61-CLAWHUB-PUBLISH-QA.md for the QA pass.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const skillDir = join(repoRoot, 'skills', 'fsb');
const distDir = join(repoRoot, 'dist', 'skill');

if (!existsSync(skillDir)) {
  console.error('[FAIL] skills/fsb/ does not exist at', skillDir);
  process.exit(1);
}

// Extract version from SKILL.md frontmatter
const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const versionMatch = skillMd.match(/^version:\s*(\S+)\s*$/m);
if (!versionMatch) {
  console.error('[FAIL] could not extract version from SKILL.md frontmatter');
  process.exit(1);
}
const version = versionMatch[1];
console.log('[OK] skill version:', version);

mkdirSync(distDir, { recursive: true });

const outZip = join(distDir, `FSB-Skill-${version}.zip`);
console.log('[..] packaging to:', outZip);

// Use system zip with deterministic options. Exclude hidden/system files.
// -X strips extra file attributes; -r recurses; -q is quiet.
try {
  execFileSync(
    'zip',
    [
      '-X', '-r', '-q',
      outZip,
      'skills/fsb/',
      '-x', '*.DS_Store',
      '-x', '*node_modules*',
      '-x', '*.git/*',
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  );
} catch (err) {
  console.error('[FAIL] zip command failed:', err.message);
  process.exit(1);
}

console.log('[OK] artifact:', outZip);
console.log('');
console.log('To publish (user-gated):');
console.log('  clawhub login');
console.log('  clawhub publish "skills/fsb"');
console.log('');
console.log('See .planning/v0.9.61-CLAWHUB-PUBLISH-QA.md for the pre-publish QA pass.');
