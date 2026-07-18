#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHASE = '63-native-messaging-host';
const IMPLEMENTATION_BASE = '27bddf00517738c87fcc6ca4b27940e8121f2124';
const IMPLEMENTATION_END = 'd8fced58776cc7ce6caff59906b78486ca927138';
const COMPATIBILITY_COMMIT = 'd8fced58776cc7ce6caff59906b78486ca927138';
const IMPLEMENTATION_PATCH_BYTES = 826923;
const IMPLEMENTATION_PATCH_SHA256 =
  'b72df228562fcd6b0dfecf5f938b73e545bbd46a0b52899238ac7cbeeb3e13ac';
const IMPLEMENTATION_MANIFEST_SHA256 =
  '6821141e31e08ed675d92baf099d711ca5d91246aabba250cd2e694318d84ba3';
const IMPLEMENTATION_INDEX_SHA256 =
  '66933b2f78b0f451d918990d02b0aecd9429caa791a06b84034c46b189d45719';
const IMPLEMENTATION_WORKTREE_INDEX_SHA256 =
  'c27a484743912eb8c651c75e9b87bea1aa603f534173a900543f1ff692a59c21';
const UNRELATED_WORKTREE_DIFF_SHA256 =
  'b1ccbbcd93a1a121f8d6b77c2c3ca2dda0690e87816a5bae71610c2013426e91';
const HUMAN_UAT_SHA256 =
  '6161b427fc8d209fe278952345460b2dacd7ede7ca0e4813ded21abd11d5bde2';
const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const IMPLEMENTATION_FILES = Object.freeze([
  '.github/workflows/ci.yml',
  '.github/workflows/npm-publish.yml',
  'extension/background.js',
  'extension/manifest.json',
  'extension/ui/sidepanel.css',
  'extension/ui/sidepanel.js',
  'extension/utils/native-host-wake.js',
  'mcp/native-host/posix/fsb-native-host-launcher.mjs.in',
  'mcp/native-host/runtime-integrity.json',
  'mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in',
  'mcp/native-host/windows/fsb-native-host-bootstrap.c',
  'mcp/package-lock.json',
  'mcp/package.json',
  'mcp/src/agent-providers/serve-delegation.ts',
  'mcp/src/diagnostics.ts',
  'mcp/src/http.ts',
  'mcp/src/index.ts',
  'mcp/src/install.ts',
  'mcp/src/native-host-install/index.ts',
  'mcp/src/native-host-install/platform.ts',
  'mcp/src/native-host-install/runtime.ts',
  'mcp/src/native-host-install/types.ts',
  'mcp/src/native-host-production.ts',
  'mcp/src/native-host-registration.ts',
  'mcp/src/native-host/constants.ts',
  'mcp/src/native-host/daemon.ts',
  'mcp/src/native-host/entry.ts',
  'mcp/src/native-host/index.ts',
  'mcp/src/native-host/platform.ts',
  'mcp/src/native-host/protocol.ts',
  'mcp/src/native-host/runtime-layout.ts',
  'package.json',
  'scripts/build-native-host-windows.mjs',
  'scripts/run-mcp-build-preserving-workspace.mjs',
  'scripts/run-phase63-focused-tests.mjs',
  'scripts/verify-native-host-boundary.mjs',
  'tests/delegation-phase-contract.test.js',
  'tests/delegation-sidepanel-ui.test.js',
  'tests/lattice-provider-bridge-smoke.test.js',
  'tests/mcp-bridge-background-dispatch.test.js',
  'tests/mcp-bridge-topology.test.js',
  'tests/mcp-client-inventory.test.js',
  'tests/mcp-diagnostics-status.test.js',
  'tests/mcp-install-platforms.test.js',
  'tests/mcp-native-host-daemon.test.js',
  'tests/mcp-native-host-install.test.js',
  'tests/mcp-native-host-packaging.test.js',
  'tests/mcp-native-host-protocol.test.js',
  'tests/mcp-reverse-channel-contract.test.js',
  'tests/mcp-version-parity.test.js',
  'tests/native-host-background-wake.test.js',
  'tests/sidepanel-tab-aware-smoke.test.js',
]);

const SUMMARY_INPUTS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => (
    `.planning/phases/${PHASE}/63-${String(index + 1).padStart(2, '0')}-SUMMARY.md`
  )),
);

const FROZEN_INPUTS = Object.freeze([
  `phase63-implementation.patch@sha256:${IMPLEMENTATION_PATCH_SHA256}`,
  `phase63-implementation-manifest@sha256:${IMPLEMENTATION_MANIFEST_SHA256}`,
]);

const COMMON_PHASE_INPUTS = Object.freeze([
  ...SUMMARY_INPUTS,
  `.planning/phases/${PHASE}/63-CONTEXT.md`,
]);

const REVIEW_INFRASTRUCTURE = Object.freeze([
  'scripts/verify-phase63-review-artifacts.mjs',
  `.planning/phases/${PHASE}/63-REVIEW.md`,
  `.planning/phases/${PHASE}/63-SECURITY.md`,
  `.planning/phases/${PHASE}/63-UI-REVIEW.md`,
]);
const REVIEW_VERIFIER = REVIEW_INFRASTRUCTURE[0];

const KIND_CONFIG = Object.freeze({
  code: Object.freeze({
    reviewer: 'gsd-code-reviewer',
    promptVersion: 'phase63-code-v1',
    output: `.planning/phases/${PHASE}/63-REVIEW.md`,
    inputs: Object.freeze([
      ...FROZEN_INPUTS,
      ...COMMON_PHASE_INPUTS,
      `.planning/phases/${PHASE}/63-RESEARCH.md`,
      `.planning/phases/${PHASE}/63-PATTERNS.md`,
      `.planning/phases/${PHASE}/63-VALIDATION.md`,
      `.planning/phases/${PHASE}/63-HUMAN-UAT.md`,
      '.planning/phases/59-reverse-request-channel-security-foundation/59-CONTEXT.md',
      '.planning/phases/61-delegation-ux-sw-eviction-persistence/61-CONTEXT.md',
      '.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md',
    ]),
    sections: Object.freeze([
      'Review Identity',
      'Allowed Inputs',
      'Implementation Manifest',
      'Review Infrastructure',
      'Output Scope',
      'Review Scope',
      'Requirement Coverage',
      'Decision Coverage',
      'Remediation Verification',
      'Precomputed Plan 10 Evidence',
      'Findings',
      'Residual Human Evidence Boundary',
    ]),
    minimumCitations: 36,
  }),
  security: Object.freeze({
    reviewer: 'gsd-security-auditor',
    promptVersion: 'phase63-security-v1',
    output: `.planning/phases/${PHASE}/63-SECURITY.md`,
    inputs: Object.freeze([
      ...FROZEN_INPUTS,
      ...COMMON_PHASE_INPUTS,
      `.planning/phases/${PHASE}/63-RESEARCH.md`,
      `.planning/phases/${PHASE}/63-PATTERNS.md`,
      `.planning/phases/${PHASE}/63-VALIDATION.md`,
      `.planning/phases/${PHASE}/63-HUMAN-UAT.md`,
      '.planning/phases/59-reverse-request-channel-security-foundation/59-CONTEXT.md',
      '.planning/phases/61-delegation-ux-sw-eviction-persistence/61-CONTEXT.md',
      '.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md',
    ]),
    sections: Object.freeze([
      'Review Identity',
      'Allowed Inputs',
      'Implementation Manifest',
      'Review Infrastructure',
      'Output Scope',
      'Native Authority Trace',
      'Threat Dispositions',
      'ASVS L1 Themes',
      'Explicit Attack Checks',
      'Precomputed Plan 10 Evidence',
      'Findings',
      'Residual Human Evidence Boundary',
    ]),
    minimumCitations: 44,
  }),
  ui: Object.freeze({
    reviewer: 'gsd-ui-auditor',
    promptVersion: 'phase63-ui-v1',
    output: `.planning/phases/${PHASE}/63-UI-REVIEW.md`,
    inputs: Object.freeze([
      ...FROZEN_INPUTS,
      ...COMMON_PHASE_INPUTS,
      `.planning/phases/${PHASE}/63-UI-SPEC.md`,
      `.planning/phases/${PHASE}/63-PATTERNS.md`,
      `.planning/phases/${PHASE}/63-VALIDATION.md`,
      `.planning/phases/${PHASE}/63-HUMAN-UAT.md`,
      '.planning/phases/61-delegation-ux-sw-eviction-persistence/61-CONTEXT.md',
    ]),
    sections: Object.freeze([
      'Review Identity',
      'Allowed Inputs',
      'Implementation Manifest',
      'Review Infrastructure',
      'Output Scope',
      'Six-Pillar Audit',
      'UI-SPEC Acceptance Criteria',
      'Locked Source Checks',
      'Precomputed Plan 10 Evidence',
      'Findings',
      'Residual Human Evidence Boundary',
    ]),
    minimumCitations: 16,
  }),
});

const FRONTMATTER_KEYS = Object.freeze([
  'phase',
  'review_kind',
  'reviewer',
  'prompt_version',
  'status',
  'implementation_base',
  'implementation_end',
  'compatibility_commit',
  'implementation_bytes',
  'implementation_files',
  'implementation_manifest_sha256',
  'implementation_sha256',
  'implementation_index_sha256',
  'implementation_worktree_index_sha256',
  'output_path',
  'live_uat',
  'findings_critical',
  'findings_high',
  'findings_medium',
  'findings_low',
  'findings_info',
  'unresolved_critical',
  'unresolved_high',
]);

const SEVERITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
const FINDING_STATUSES = Object.freeze(['resolved', 'accepted', 'open', 'not-applicable']);
const SOURCE_CITATION_PATTERN =
  /(?:\.github|extension|mcp|scripts|tests)(?:\/[A-Za-z0-9_.-]+)+:\d+(?:-\d+)?|package\.json:\d+(?:-\d+)?/gu;

class ReviewVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewVerificationError';
  }
}

function fail(message) {
  throw new ReviewVerificationError(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBytes(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (result.stderr ?? Buffer.alloc(0)).toString('utf8').trim();
    fail(`git ${args[0]} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function splitNul(bytes) {
  return bytes.toString('utf8').split('\0').filter(Boolean);
}

function verifyReviewOutputScope(kinds) {
  const staged = gitBytes(['diff', '--cached', '--binary', '--no-ext-diff', 'HEAD']);
  if (staged.length !== 0) {
    fail('reviewer or executor left staged changes in the raw Git index');
  }

  const unrelated = gitBytes([
    'diff',
    '--binary',
    '--no-ext-diff',
    'HEAD',
    '--',
    '.',
    ...REVIEW_INFRASTRUCTURE.map((path) => `:(exclude)${path}`),
  ]);
  const unrelatedHash = sha256(unrelated);
  if (unrelatedHash !== UNRELATED_WORKTREE_DIFF_SHA256) {
    fail(`unrelated tracked worktree changed: expected ${UNRELATED_WORKTREE_DIFF_SHA256}, got ${unrelatedHash}`);
  }

  const humanUat = readFileSync(
    resolve(REPO_ROOT, `.planning/phases/${PHASE}/63-HUMAN-UAT.md`),
  );
  if (sha256(humanUat) !== HUMAN_UAT_SHA256) {
    fail('63-HUMAN-UAT.md changed or was falsely promoted during review');
  }

  const allowedOutputs = new Set(kinds.map((kind) => KIND_CONFIG[kind].output));
  const reviewDiffs = splitNul(gitBytes([
    'diff', '--name-only', '-z', 'HEAD', '--', ...REVIEW_INFRASTRUCTURE,
  ]));
  for (const path of reviewDiffs) {
    if (!allowedOutputs.has(path)) {
      fail(`reviewer mutated unscoped review infrastructure: ${path}`);
    }
  }

  const allowedUntracked = new Set([REVIEW_VERIFIER, ...allowedOutputs]);
  const untracked = splitNul(gitBytes(['ls-files', '--others', '--exclude-standard', '-z']));
  for (const path of untracked) {
    if (!allowedUntracked.has(path)) {
      fail(`reviewer created unscoped output: ${path}`);
    }
  }
}

function computeWorktreeIndexFingerprint(indexHash, cachedHash, worktreeHash) {
  return sha256(Buffer.concat([
    Buffer.from('phase63-review-worktree-index-v1\0', 'utf8'),
    Buffer.from(indexHash, 'utf8'),
    Buffer.from('\0', 'utf8'),
    Buffer.from(cachedHash, 'utf8'),
    Buffer.from('\0', 'utf8'),
    Buffer.from(worktreeHash, 'utf8'),
    Buffer.from('\0', 'utf8'),
  ]));
}

function verifyFrozenImplementationIdentity() {
  const manifestBytes = Buffer.from(`${IMPLEMENTATION_FILES.join('\n')}\n`, 'utf8');
  if (sha256(manifestBytes) !== IMPLEMENTATION_MANIFEST_SHA256) {
    fail('embedded implementation manifest hash is internally inconsistent');
  }

  const changedImplementationFiles = splitNul(gitBytes([
    'diff', '--name-only', '-z', IMPLEMENTATION_BASE, IMPLEMENTATION_END,
  ])).filter((path) => (
    !path.startsWith('.planning/')
    && !path.startsWith('mcp/build/')
    && !REVIEW_INFRASTRUCTURE.includes(path)
  )).sort();
  requireExactList(
    changedImplementationFiles,
    IMPLEMENTATION_FILES,
    'canonical changed implementation manifest',
    'implementation identity',
  );

  const patch = gitBytes([
    'diff',
    '--binary',
    '--no-ext-diff',
    IMPLEMENTATION_BASE,
    IMPLEMENTATION_END,
    '--',
    ...IMPLEMENTATION_FILES,
  ]);
  if (patch.length !== IMPLEMENTATION_PATCH_BYTES) {
    fail(`implementation patch byte length changed: expected ${IMPLEMENTATION_PATCH_BYTES}, got ${patch.length}`);
  }
  const patchHash = sha256(patch);
  if (patchHash !== IMPLEMENTATION_PATCH_SHA256) {
    fail(`implementation patch hash changed: expected ${IMPLEMENTATION_PATCH_SHA256}, got ${patchHash}`);
  }

  const index = gitBytes(['ls-files', '--stage', '-z', '--', ...IMPLEMENTATION_FILES]);
  const cached = gitBytes([
    'diff', '--cached', '--binary', '--no-ext-diff', IMPLEMENTATION_END, '--',
    ...IMPLEMENTATION_FILES,
  ]);
  const worktree = gitBytes([
    'diff', '--binary', '--no-ext-diff', IMPLEMENTATION_END, '--',
    ...IMPLEMENTATION_FILES,
  ]);
  const indexHash = sha256(index);
  const cachedHash = sha256(cached);
  const worktreeHash = sha256(worktree);
  const fingerprint = computeWorktreeIndexFingerprint(
    indexHash,
    cachedHash,
    worktreeHash,
  );

  if (indexHash !== IMPLEMENTATION_INDEX_SHA256) {
    fail(`implementation index hash changed: expected ${IMPLEMENTATION_INDEX_SHA256}, got ${indexHash}`);
  }
  if (cachedHash !== EMPTY_SHA256 || worktreeHash !== EMPTY_SHA256) {
    fail('implementation manifest has staged or worktree mutation after the frozen end commit');
  }
  if (fingerprint !== IMPLEMENTATION_WORKTREE_INDEX_SHA256) {
    fail(`implementation worktree/index fingerprint changed: expected ${IMPLEMENTATION_WORKTREE_INDEX_SHA256}, got ${fingerprint}`);
  }

  return Object.freeze({
    base: IMPLEMENTATION_BASE,
    end: IMPLEMENTATION_END,
    patchBytes: patch.length,
    patchSha256: patchHash,
    manifestSha256: IMPLEMENTATION_MANIFEST_SHA256,
    indexSha256: indexHash,
    worktreeIndexSha256: fingerprint,
  });
}

function parseFrontmatter(text, label) {
  if (!text.startsWith('---\n')) fail(`${label}: missing frontmatter opener`);
  const closing = text.indexOf('\n---\n', 4);
  if (closing < 0) fail(`${label}: missing frontmatter closer`);
  const fields = new Map();
  const lines = text.slice(4, closing).split('\n');
  for (const line of lines) {
    const match = /^([a-z][a-z0-9_]*): (.*)$/u.exec(line);
    if (!match) fail(`${label}: malformed frontmatter line ${JSON.stringify(line)}`);
    if (fields.has(match[1])) fail(`${label}: duplicate frontmatter key ${match[1]}`);
    fields.set(match[1], match[2]);
  }
  const actualKeys = [...fields.keys()];
  if (actualKeys.length !== FRONTMATTER_KEYS.length) {
    fail(`${label}: frontmatter key count changed`);
  }
  for (let index = 0; index < FRONTMATTER_KEYS.length; index += 1) {
    if (actualKeys[index] !== FRONTMATTER_KEYS[index]) {
      fail(`${label}: expected frontmatter key ${FRONTMATTER_KEYS[index]} at position ${index + 1}`);
    }
  }
  return fields;
}

function expectField(fields, name, expected, label) {
  const actual = fields.get(name);
  if (actual !== String(expected)) {
    fail(`${label}: ${name} must be ${expected}, got ${actual ?? '<missing>'}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function sectionBody(text, heading, label) {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, 'gmu');
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`${label}: section "${heading}" must appear exactly once`);
  }
  const start = matches[0].index + matches[0][0].length;
  const remainder = text.slice(start);
  const next = /^## /mu.exec(remainder);
  return remainder.slice(0, next?.index ?? remainder.length).trim();
}

function parseExactBulletSection(text, heading, label) {
  const body = sectionBody(text, heading, label);
  if (!body) fail(`${label}: section "${heading}" is empty`);
  return body.split('\n').map((line) => {
    const match = /^- `([^`]+)`$/u.exec(line);
    if (!match) fail(`${label}: section "${heading}" must contain only backticked bullets`);
    return match[1];
  });
}

function requireExactList(actual, expected, description, label) {
  if (actual.length !== expected.length) {
    fail(`${label}: ${description} count changed; expected ${expected.length}, got ${actual.length}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      fail(`${label}: ${description} item ${index + 1} must be ${expected[index]}, got ${actual[index]}`);
    }
  }
}

function requireMarkers(body, markers, description, label) {
  for (const marker of markers) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(marker)}([^A-Za-z0-9-]|$)`, 'u');
    if (!pattern.test(body)) fail(`${label}: ${description} is missing ${marker}`);
  }
}

function parseMarkdownTable(body, expectedHeader, description, label) {
  const lines = body.split('\n').filter((line) => line.trim().startsWith('|'));
  if (lines.length < 3) fail(`${label}: ${description} table is missing or empty`);
  const split = (line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
  const header = split(lines[0]);
  requireExactList(header, expectedHeader, `${description} header`, label);
  if (lines[1].replace(/[|:\-\s]/gu, '').length !== 0) {
    fail(`${label}: ${description} delimiter is malformed`);
  }
  const rows = [];
  for (const line of lines.slice(2)) {
    const row = split(line);
    if (row.length !== expectedHeader.length) {
      fail(`${label}: ${description} row has ${row.length} columns; expected ${expectedHeader.length}`);
    }
    rows.push(row);
  }
  if (rows.length === 0) fail(`${label}: ${description} has no data rows`);
  return rows;
}

function validateFindings(text, fields, kind, label) {
  const body = sectionBody(text, 'Findings', label);
  const rows = parseMarkdownTable(
    body,
    ['ID', 'Severity', 'Status', 'Resolution', 'Evidence'],
    'findings',
    label,
  );
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  const seen = new Set();
  for (const [id, severity, status, resolution, evidence] of rows) {
    if (id === 'NONE') {
      if (rows.length !== 1 || severity !== 'INFO' || status !== 'not-applicable') {
        fail(`${label}: NONE must be the sole INFO/not-applicable findings row`);
      }
    } else {
      const prefix = kind === 'code' ? 'CODE' : kind === 'security' ? 'SECURITY' : 'UI';
      if (!new RegExp(`^F63-${prefix}-\\d{2}$`, 'u').test(id)) {
        fail(`${label}: invalid finding id ${id}`);
      }
      if (seen.has(id)) fail(`${label}: duplicate finding id ${id}`);
      seen.add(id);
      if (!SEVERITIES.includes(severity)) fail(`${label}: unknown severity ${severity}`);
      counts[severity] += 1;
      if (severity === 'CRITICAL' || severity === 'HIGH') {
        fail(`${label}: blocking ${severity} finding ${id} cannot pass the frozen review`);
      }
    }
    if (!SEVERITIES.includes(severity)) fail(`${label}: unknown severity ${severity}`);
    if (!FINDING_STATUSES.includes(status)) fail(`${label}: unknown finding status ${status}`);
    if (resolution.length < 20 || evidence.length < 20) {
      fail(`${label}: finding ${id} lacks a concrete resolution or evidence disposition`);
    }
    if (!(evidence.match(SOURCE_CITATION_PATTERN) ?? []).length) {
      fail(`${label}: finding ${id} lacks a source/test line citation`);
    }
  }
  for (const severity of SEVERITIES) {
    expectField(
      fields,
      `findings_${severity.toLowerCase()}`,
      counts[severity],
      label,
    );
  }
  expectField(fields, 'unresolved_critical', 0, label);
  expectField(fields, 'unresolved_high', 0, label);
}

function validateCommon(kind, text, config, label) {
  if (/\b(?:TODO|TBD|FIXME|PLACEHOLDER|LOREM IPSUM)\b/iu.test(text)) {
    fail(`${label}: placeholder text is forbidden`);
  }
  if (/\b(?:BLOCKER|WARNING|WARN|MAJOR|MINOR)\b/iu.test(text)) {
    fail(`${label}: non-normalized severity vocabulary is forbidden`);
  }
  if (/\[(?:x|X)\]/u.test(text)) {
    fail(`${label}: checked boxes could falsely promote deferred evidence`);
  }
  if (
    /(?:live|human)[ -]?UAT\s*(?::|=|-)?\s*(?:pass(?:ed)?|complete(?:d)?|verified)/iu.test(text)
    || /\b(?:screenshots?|browser rendering|screen reader|real OS install)\s+(?:was |were )?(?:captured|passed|verified)\b/iu.test(text)
  ) {
    fail(`${label}: live or human evidence is falsely promoted`);
  }

  const fields = parseFrontmatter(text, label);
  expectField(fields, 'phase', PHASE, label);
  expectField(fields, 'review_kind', kind, label);
  expectField(fields, 'reviewer', config.reviewer, label);
  expectField(fields, 'prompt_version', config.promptVersion, label);
  expectField(fields, 'status', 'pass', label);
  expectField(fields, 'implementation_base', IMPLEMENTATION_BASE, label);
  expectField(fields, 'implementation_end', IMPLEMENTATION_END, label);
  expectField(fields, 'compatibility_commit', COMPATIBILITY_COMMIT, label);
  expectField(fields, 'implementation_bytes', IMPLEMENTATION_PATCH_BYTES, label);
  expectField(fields, 'implementation_files', IMPLEMENTATION_FILES.length, label);
  expectField(fields, 'implementation_manifest_sha256', IMPLEMENTATION_MANIFEST_SHA256, label);
  expectField(fields, 'implementation_sha256', IMPLEMENTATION_PATCH_SHA256, label);
  expectField(fields, 'implementation_index_sha256', IMPLEMENTATION_INDEX_SHA256, label);
  expectField(
    fields,
    'implementation_worktree_index_sha256',
    IMPLEMENTATION_WORKTREE_INDEX_SHA256,
    label,
  );
  expectField(fields, 'output_path', config.output, label);
  expectField(fields, 'live_uat', 'pending', label);

  for (const heading of config.sections) sectionBody(text, heading, label);

  const identity = sectionBody(text, 'Review Identity', label);
  requireMarkers(identity, [
    IMPLEMENTATION_BASE,
    IMPLEMENTATION_END,
    COMPATIBILITY_COMMIT,
    IMPLEMENTATION_PATCH_SHA256,
    IMPLEMENTATION_MANIFEST_SHA256,
    IMPLEMENTATION_INDEX_SHA256,
    IMPLEMENTATION_WORKTREE_INDEX_SHA256,
    String(IMPLEMENTATION_PATCH_BYTES),
    'tests/delegation-phase-contract.test.js',
  ], 'review identity', label);

  requireExactList(
    parseExactBulletSection(text, 'Allowed Inputs', label),
    config.inputs,
    'allowed input',
    label,
  );
  requireExactList(
    parseExactBulletSection(text, 'Implementation Manifest', label),
    IMPLEMENTATION_FILES,
    'implementation manifest',
    label,
  );
  requireExactList(
    parseExactBulletSection(text, 'Review Infrastructure', label),
    REVIEW_INFRASTRUCTURE,
    'review infrastructure',
    label,
  );
  requireExactList(
    parseExactBulletSection(text, 'Output Scope', label),
    [config.output],
    'output scope',
    label,
  );

  const citations = new Set(text.match(SOURCE_CITATION_PATTERN) ?? []);
  if (citations.size < config.minimumCitations) {
    fail(`${label}: expected at least ${config.minimumCitations} distinct source/test line citations, got ${citations.size}`);
  }

  const plan10 = sectionBody(text, 'Precomputed Plan 10 Evidence', label);
  requireMarkers(plan10, [
    'precomputed Plan 10',
    'precomputed remediation evidence',
    'reviewer ran no commands',
    'scripts/run-phase63-focused-tests.mjs',
    '87/87',
    '200/200',
    '1015/1015',
    '142/142',
    '101 platform/production CLI assertions',
    '125 platform/registration assertions',
    '229 install transaction assertions',
    '152 CLI-routing assertions',
    '54 bounded-output assertions',
    '229 diagnostics assertions',
    '229 daemon/entry assertions',
    '111 background-wake assertions',
    '1,014-assertion Phase 61–63 contract gate',
  ], 'precomputed evidence', label);

  const residual = sectionBody(text, 'Residual Human Evidence Boundary', label);
  requireMarkers(residual, [
    '63-HUMAN-UAT.md',
    'pending',
    'real OS',
    'Chrome',
    'visual rendering',
    'focus',
    'screen-reader',
  ], 'residual evidence boundary', label);

  validateFindings(text, fields, kind, label);
  return Object.freeze({
    base: fields.get('implementation_base'),
    end: fields.get('implementation_end'),
    patchSha256: fields.get('implementation_sha256'),
    manifestSha256: fields.get('implementation_manifest_sha256'),
    indexSha256: fields.get('implementation_index_sha256'),
    worktreeIndexSha256: fields.get('implementation_worktree_index_sha256'),
  });
}

function validateCode(text, label) {
  const requirementBody = sectionBody(text, 'Requirement Coverage', label);
  requireMarkers(
    requirementBody,
    Array.from({ length: 4 }, (_, index) => `NATIVE-0${index + 1}`),
    'requirement coverage',
    label,
  );
  const decisionBody = sectionBody(text, 'Decision Coverage', label);
  requireMarkers(
    decisionBody,
    Array.from({ length: 25 }, (_, index) => `D63-${String(index + 1).padStart(2, '0')}`),
    'decision coverage',
    label,
  );
  const scope = sectionBody(text, 'Review Scope', label);
  requireMarkers(scope, [
    'correctness',
    'race/lifecycle',
    'framing/size limits',
    'platform/registry',
    'atomic ownership',
    'bundled-offline closure',
    'workspace preservation',
    'one-flight/no-replay',
    'error normalization',
    'test strength',
    'root/CI ordering',
    'compatibility',
    'maintainability',
    'direct/global bin operation without npm environment',
    'validated npm candidate provenance',
    'npm-independent uninstall receipt reconstruction',
    'Windows user/64 missing or unavailable',
    'mutation boundary',
    'OS loopback one-flight lease',
    'port collision',
    'crash release',
    'A/B/C scheduling',
    'identity claim/rollback',
    'spawn/readiness/release ordering',
    'malformed/foreign lock preservation',
  ], 'code review scope', label);

  const remediation = sectionBody(text, 'Remediation Verification', label);
  requireMarkers(remediation, [
    'F63-CODE-01',
    'F63-CODE-02',
    'F63-CODE-03',
    'F63-CODE-04',
    'F63-CODE-05',
    'F63-CODE-06',
    'resolved',
    'mcp/src/native-host-production.ts',
    'mcp/src/native-host/daemon.ts',
    'mcp/src/native-host-install/index.ts',
    'mcp/src/native-host-install/platform.ts',
    'tests/mcp-install-platforms.test.js',
    'tests/mcp-native-host-install.test.js',
    'tests/mcp-native-host-daemon.test.js',
    'wake.lock.pending-',
    'user/64',
    'one-flight lease',
  ], 'review remediation verification', label);
}

const THREAT_SEVERITY = Object.freeze({
  'T63-01': 'HIGH',
  'T63-02': 'CRITICAL',
  'T63-03': 'HIGH',
  'T63-04': 'HIGH',
  'T63-05': 'HIGH',
  'T63-06': 'HIGH',
  'T63-07': 'CRITICAL',
  'T63-08': 'HIGH',
  'T63-09': 'HIGH',
  'T63-10': 'HIGH',
  'T63-11': 'HIGH',
  'T63-12': 'CRITICAL',
});

function validateSecurity(text, label) {
  if (
    /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\Users\\\\)/u.test(text)
    || /(?:Authorization\s*:|Bearer\s+[A-Za-z0-9._~-]{8,}|FSB_MCP_BRIDGE_SECRET\s*=|sk-[A-Za-z0-9_-]{8,})/iu.test(text)
  ) {
    fail(`${label}: raw local path or secret-shaped evidence is forbidden`);
  }

  const trace = sectionBody(text, 'Native Authority Trace', label);
  requireMarkers(trace, [
    'Chrome framing',
    'packaged launcher',
    'bundled/offline runtime',
    'daemon readiness',
    'bridge auth',
    'agent authority',
    'installer ownership',
    'diagnostics',
    'browser projection',
    'production composer',
    'one-flight lease',
  ], 'native authority trace', label);

  const threatBody = sectionBody(text, 'Threat Dispositions', label);
  const rows = parseMarkdownTable(
    threatBody,
    ['Threat', 'Severity', 'Disposition', 'Status', 'Exploit path', 'Mitigation', 'Evidence', 'Residual risk'],
    'threat dispositions',
    label,
  );
  if (rows.length !== 12) fail(`${label}: threat table must contain exactly 12 rows`);
  const seen = new Set();
  for (const [id, severity, disposition, status, exploit, mitigation, evidence, residual] of rows) {
    if (!Object.hasOwn(THREAT_SEVERITY, id)) fail(`${label}: unknown threat ${id}`);
    if (seen.has(id)) fail(`${label}: duplicate threat ${id}`);
    seen.add(id);
    if (severity !== THREAT_SEVERITY[id]) fail(`${label}: ${id} severity changed`);
    const expectedDisposition = id === 'T63-07' ? 'avoid' : 'mitigate';
    if (disposition !== expectedDisposition) fail(`${label}: ${id} disposition changed`);
    if (status !== 'closed') fail(`${label}: ${id} is not closed`);
    if (exploit.length < 24 || mitigation.length < 24 || residual.length < 24) {
      fail(`${label}: ${id} lacks exploit, mitigation, or residual-risk detail`);
    }
    if ((evidence.match(SOURCE_CITATION_PATTERN) ?? []).length < 2) {
      fail(`${label}: ${id} needs both source and test line evidence`);
    }
  }
  requireMarkers(threatBody, Object.keys(THREAT_SEVERITY), 'threat coverage', label);

  const asvs = sectionBody(text, 'ASVS L1 Themes', label);
  requireMarkers(
    asvs,
    ['V2', 'V3', 'V4', 'V5', 'V7', 'V12', 'V13', 'V14'],
    'ASVS L1 coverage',
    label,
  );

  const checks = sectionBody(text, 'Explicit Attack Checks', label);
  requireMarkers(checks, [
    'SEC-CHECK-FRAMING',
    'SEC-CHECK-HEALTH',
    'SEC-CHECK-BUNDLE',
    'SEC-CHECK-NOFOLLOW',
    'SEC-CHECK-PROCESS-BOUNDS',
    'SEC-CHECK-RECEIPT-TRUST',
    'SEC-CHECK-REG-EXE',
    'SEC-CHECK-PATH-REGISTRY',
    'SEC-CHECK-SYMLINK-REPARSE',
    'SEC-CHECK-FOREIGN-PRESERVATION',
    'SEC-CHECK-STALE-LOCK',
    'SEC-CHECK-PUBLICATION-QUARANTINE',
    'SEC-CHECK-INSPECTOR',
    'SEC-CHECK-REDACTION',
    'SEC-CHECK-WAKE-FLOOD',
    'SEC-CHECK-CORRELATION',
    'SEC-CHECK-DIRECT-AGENT',
    'SEC-CHECK-CHAN',
      'SEC-CHECK-WORKSPACE-INDEX',
      'SEC-CHECK-EXECUTABLE-PROVENANCE',
      'SEC-CHECK-ENV-PATH-EXCLUSION',
      'SEC-CHECK-NPM-MANIFEST-TRUST',
      'SEC-CHECK-RECEIPT-TRAVERSAL',
      'SEC-CHECK-REG-SYSTEMROOT',
      'SEC-CHECK-REG-LOCALIZED-OUTPUT',
      'SEC-CHECK-REG-VIEWS',
      'SEC-CHECK-LEASE-BIND-SCOPE',
      'SEC-CHECK-LEASE-PORT-COLLISION',
      'SEC-CHECK-LEASE-CONNECTIONS',
      'SEC-CHECK-LEASE-CRASH-RELEASE',
      'SEC-CHECK-CLAIM-IDENTITY',
      'SEC-CHECK-CLAIM-CLEANUP',
      'SEC-CHECK-AGENT-AUTHORITY',
    ], 'explicit security checks', label);
}

const UI_COPY = Object.freeze([
  'Checking local agent service',
  'FSB is trying to make the local agent service available. Your message has not been sent.',
  'Checking local agent service. Your message has not been sent.',
  'Checking agent service',
]);

function validateUi(text, label) {
  const pillars = sectionBody(text, 'Six-Pillar Audit', label);
  requireMarkers(pillars, [
    'Visual hierarchy',
    'Interaction',
    'Responsiveness',
    'Accessibility',
    'Resilience',
    'Design-system fidelity',
  ], 'six-pillar audit', label);

  const criteria = sectionBody(text, 'UI-SPEC Acceptance Criteria', label);
  requireMarkers(
    criteria,
    Array.from({ length: 7 }, (_, index) => `UIAC-${String(index + 1).padStart(2, '0')}`),
    'UI-SPEC acceptance coverage',
    label,
  );

  const checks = sectionBody(text, 'Locked Source Checks', label);
  requireMarkers(checks, [
    ...UI_COPY,
    'UI-CHECK-COPY',
    'UI-CHECK-RAW-REVISION',
    'UI-CHECK-REVERT',
    'UI-CHECK-FENCES',
    'UI-CHECK-STALE',
    'UI-CHECK-SPINNER',
    'UI-CHECK-NO-NEW-SURFACE',
    'UI-CHECK-TOKENS',
    'UI-CHECK-NARROW-ZOOM',
    'UI-CHECK-FORCED-COLORS',
    'UI-CHECK-REDUCED-MOTION',
    'UI-CHECK-UNCHANGED-FLOWS',
    'info semantics',
    'aria-busy',
    'aria-hidden',
    'role="status"',
  ], 'locked UI source checks', label);
}

function validateArtifact(kind, text, label = `${kind} artifact`) {
  const config = KIND_CONFIG[kind];
  if (!config) fail(`${label}: missing or unknown review kind`);
  if (typeof text !== 'string' || text.length === 0) fail(`${label}: artifact is missing`);
  const identity = validateCommon(kind, text, config, label);
  if (kind === 'code') validateCode(text, label);
  else if (kind === 'security') validateSecurity(text, label);
  else validateUi(text, label);
  return identity;
}

function selectKinds(argv) {
  if (argv.length === 0) return Object.freeze(['code', 'security', 'ui']);
  if (argv.length !== 2 || argv[0] !== '--kind' || !Object.hasOwn(KIND_CONFIG, argv[1])) {
    fail('usage: node scripts/verify-phase63-review-artifacts.mjs [--kind code|security|ui]');
  }
  return Object.freeze([argv[1]]);
}

function frontmatterForFixture(kind) {
  const config = KIND_CONFIG[kind];
  return [
    '---',
    `phase: ${PHASE}`,
    `review_kind: ${kind}`,
    `reviewer: ${config.reviewer}`,
    `prompt_version: ${config.promptVersion}`,
    'status: pass',
    `implementation_base: ${IMPLEMENTATION_BASE}`,
    `implementation_end: ${IMPLEMENTATION_END}`,
    `compatibility_commit: ${COMPATIBILITY_COMMIT}`,
    `implementation_bytes: ${IMPLEMENTATION_PATCH_BYTES}`,
    `implementation_files: ${IMPLEMENTATION_FILES.length}`,
    `implementation_manifest_sha256: ${IMPLEMENTATION_MANIFEST_SHA256}`,
    `implementation_sha256: ${IMPLEMENTATION_PATCH_SHA256}`,
    `implementation_index_sha256: ${IMPLEMENTATION_INDEX_SHA256}`,
    `implementation_worktree_index_sha256: ${IMPLEMENTATION_WORKTREE_INDEX_SHA256}`,
    `output_path: ${config.output}`,
    'live_uat: pending',
    'findings_critical: 0',
    'findings_high: 0',
    'findings_medium: 0',
    'findings_low: 0',
    'findings_info: 0',
    'unresolved_critical: 0',
    'unresolved_high: 0',
    '---',
  ].join('\n');
}

function commonFixtureSections(kind) {
  const config = KIND_CONFIG[kind];
  return [
    '## Review Identity',
    '',
    `Canonical bytes ${IMPLEMENTATION_PATCH_BYTES}; base ${IMPLEMENTATION_BASE}; end and compatibility commit ${IMPLEMENTATION_END}; patch ${IMPLEMENTATION_PATCH_SHA256}; manifest ${IMPLEMENTATION_MANIFEST_SHA256}; index ${IMPLEMENTATION_INDEX_SHA256}; worktree/index ${IMPLEMENTATION_WORKTREE_INDEX_SHA256}; compatibility file tests/delegation-phase-contract.test.js:1.`,
    '',
    '## Allowed Inputs',
    '',
    ...config.inputs.map((value) => `- \`${value}\``),
    '',
    '## Implementation Manifest',
    '',
    ...IMPLEMENTATION_FILES.map((value) => `- \`${value}\``),
    '',
    '## Review Infrastructure',
    '',
    ...REVIEW_INFRASTRUCTURE.map((value) => `- \`${value}\``),
    '',
    '## Output Scope',
    '',
    `- \`${config.output}\``,
    '',
  ];
}

function fixtureCitations(count, prefix = 'tests/mcp-native-host-protocol.test.js') {
  return Array.from({ length: count }, (_, index) => `${prefix}:${index + 1}`);
}

function codeFixtureSections() {
  return [
    '## Review Scope',
    '',
    'correctness; race/lifecycle; framing/size limits; platform/registry; atomic ownership; bundled-offline closure; workspace preservation; one-flight/no-replay; error normalization; test strength; root/CI ordering; compatibility; maintainability; direct/global bin operation without npm environment; validated npm candidate provenance; npm-independent uninstall receipt reconstruction; Windows user/64 missing or unavailable at every mutation boundary; OS loopback one-flight lease; port collision; crash release; A/B/C scheduling; identity claim/rollback; spawn/readiness/release ordering; malformed/foreign lock preservation.',
    '',
    '## Requirement Coverage',
    '',
    ...Array.from({ length: 4 }, (_, index) => (
      `- NATIVE-0${index + 1}: evidence extension/background.js:${index + 1} and tests/native-host-background-wake.test.js:${index + 1}.`
    )),
    '',
    '## Decision Coverage',
    '',
    ...Array.from({ length: 25 }, (_, index) => (
      `- D63-${String(index + 1).padStart(2, '0')}: evidence mcp/src/native-host/protocol.ts:${index + 1} and tests/mcp-native-host-protocol.test.js:${index + 1}.`
    )),
    '',
    '## Remediation Verification',
    '',
    '- F63-CODE-01 resolved: production composition in mcp/src/native-host-production.ts:1 is exercised by tests/mcp-install-platforms.test.js:1.',
    '- F63-CODE-02 resolved: the production inspector in mcp/src/native-host-production.ts:2 remains closed through tests/mcp-install-platforms.test.js:2.',
    '- F63-CODE-03 resolved: wake.lock.pending- publication in mcp/src/native-host/daemon.ts:3 is exercised by tests/mcp-native-host-daemon.test.js:3.',
    '- F63-CODE-04 resolved: validated npm provenance and npm-independent uninstall in mcp/src/native-host-production.ts:4 are exercised by tests/mcp-install-platforms.test.js:4.',
    '- F63-CODE-05 resolved: user/64 missing or unavailable evidence fails closed at every mutation boundary in mcp/src/native-host-install/index.ts:5 and mcp/src/native-host-install/platform.ts:5, exercised by tests/mcp-native-host-install.test.js:5.',
    '- F63-CODE-06 resolved: the OS loopback one-flight lease and claim identity preserve malformed/foreign lock state in mcp/src/native-host/daemon.ts:6, exercised by tests/mcp-native-host-daemon.test.js:6.',
    '',
  ];
}

function securityFixtureSections() {
  const threats = Object.entries(THREAT_SEVERITY).map(([id, severity], index) => (
    `| ${id} | ${severity} | ${id === 'T63-07' ? 'avoid' : 'mitigate'} | closed | Bounded hostile input reaches the reviewed boundary only. | Closed validation prevents authority expansion before effects. | mcp/src/native-host/protocol.ts:${index + 1}; tests/mcp-native-host-protocol.test.js:${index + 1} | Real platform scheduling remains pending human evidence. |`
  ));
  return [
    '## Native Authority Trace',
    '',
    'Chrome framing -> packaged launcher -> bundled/offline runtime -> production composer -> one-flight lease -> daemon readiness -> bridge auth -> agent authority -> installer ownership -> diagnostics -> browser projection. Evidence mcp/src/native-host/entry.ts:1 and tests/mcp-native-host-install.test.js:1.',
    '',
    '## Threat Dispositions',
    '',
    '| Threat | Severity | Disposition | Status | Exploit path | Mitigation | Evidence | Residual risk |',
    '|---|---|---|---|---|---|---|---|',
    ...threats,
    '',
    '## ASVS L1 Themes',
    '',
    '- V2: bridge authentication evidence mcp/src/http.ts:1.',
    '- V3: intent/session fencing evidence extension/background.js:2.',
    '- V4: authority separation evidence mcp/src/native-host/entry.ts:3.',
    '- V5: framing validation evidence mcp/src/native-host/protocol.ts:4.',
    '- V7: sanitized diagnostics evidence mcp/src/diagnostics.ts:5.',
    '- V12: file and package controls evidence mcp/src/native-host-install/runtime.ts:6.',
    '- V13: health identity evidence mcp/src/native-host/daemon.ts:7.',
    '- V14: launcher configuration evidence mcp/native-host/windows/fsb-native-host-bootstrap.c:8.',
    '',
    '## Explicit Attack Checks',
    '',
    ...[
      'SEC-CHECK-FRAMING',
      'SEC-CHECK-HEALTH',
      'SEC-CHECK-BUNDLE',
      'SEC-CHECK-NOFOLLOW',
      'SEC-CHECK-PROCESS-BOUNDS',
      'SEC-CHECK-RECEIPT-TRUST',
      'SEC-CHECK-REG-EXE',
      'SEC-CHECK-PATH-REGISTRY',
      'SEC-CHECK-SYMLINK-REPARSE',
      'SEC-CHECK-FOREIGN-PRESERVATION',
      'SEC-CHECK-STALE-LOCK',
      'SEC-CHECK-PUBLICATION-QUARANTINE',
      'SEC-CHECK-INSPECTOR',
      'SEC-CHECK-REDACTION',
      'SEC-CHECK-WAKE-FLOOD',
      'SEC-CHECK-CORRELATION',
      'SEC-CHECK-DIRECT-AGENT',
      'SEC-CHECK-CHAN',
      'SEC-CHECK-WORKSPACE-INDEX',
      'SEC-CHECK-EXECUTABLE-PROVENANCE',
      'SEC-CHECK-ENV-PATH-EXCLUSION',
      'SEC-CHECK-NPM-MANIFEST-TRUST',
      'SEC-CHECK-RECEIPT-TRAVERSAL',
      'SEC-CHECK-REG-SYSTEMROOT',
      'SEC-CHECK-REG-LOCALIZED-OUTPUT',
      'SEC-CHECK-REG-VIEWS',
      'SEC-CHECK-LEASE-BIND-SCOPE',
      'SEC-CHECK-LEASE-PORT-COLLISION',
      'SEC-CHECK-LEASE-CONNECTIONS',
      'SEC-CHECK-LEASE-CRASH-RELEASE',
      'SEC-CHECK-CLAIM-IDENTITY',
      'SEC-CHECK-CLAIM-CLEANUP',
      'SEC-CHECK-AGENT-AUTHORITY',
    ].map((marker, index) => `- ${marker}: closed by mcp/src/native-host/daemon.ts:${index + 20} and tests/mcp-native-host-daemon.test.js:${index + 20}.`),
    '',
  ];
}

function uiFixtureSections() {
  return [
    '## Six-Pillar Audit',
    '',
    '| Pillar | Disposition | Evidence |',
    '|---|---|---|',
    '| Visual hierarchy | pass | extension/ui/sidepanel.js:1 |',
    '| Interaction | pass | extension/ui/sidepanel.js:2 |',
    '| Responsiveness | pass | extension/ui/sidepanel.css:3 |',
    '| Accessibility | pass | extension/ui/sidepanel.js:4 |',
    '| Resilience | pass | extension/background.js:5 |',
    '| Design-system fidelity | pass | extension/ui/sidepanel.css:6 |',
    '',
    '## UI-SPEC Acceptance Criteria',
    '',
    ...Array.from({ length: 7 }, (_, index) => (
      `- UIAC-${String(index + 1).padStart(2, '0')}: source disposition extension/ui/sidepanel.js:${index + 10} and DOM evidence tests/delegation-sidepanel-ui.test.js:${index + 10}.`
    )),
    '',
    '## Locked Source Checks',
    '',
    `- UI-CHECK-COPY: ${UI_COPY.join(' / ')} at extension/ui/sidepanel.js:30.`,
    '- UI-CHECK-RAW-REVISION: raw text and monotonic edit revision at extension/ui/sidepanel.js:31.',
    '- UI-CHECK-REVERT: edit-then-revert invalidation at tests/delegation-sidepanel-ui.test.js:32.',
    '- UI-CHECK-FENCES: intent/attempt fences at extension/background.js:33.',
    '- UI-CHECK-STALE: stale suppression at tests/native-host-background-wake.test.js:34.',
    '- UI-CHECK-SPINNER: one decorative spinner, aria-hidden, info semantics, and aria-busy at extension/ui/sidepanel.js:35.',
    '- UI-CHECK-NO-NEW-SURFACE: no page/card/CTA/progress control/live region/focus move; existing role="status" only at extension/ui/sidepanel.js:36.',
    '- UI-CHECK-TOKENS: token-only color at extension/ui/sidepanel.css:37.',
    '- UI-CHECK-NARROW-ZOOM: narrow/zoom contract at extension/ui/sidepanel.css:38.',
    '- UI-CHECK-FORCED-COLORS: forced colors at extension/ui/sidepanel.css:39.',
    '- UI-CHECK-REDUCED-MOTION: reduced motion at extension/ui/sidepanel.css:40.',
    '- UI-CHECK-UNCHANGED-FLOWS: ready/unpaired/offline flows unchanged at tests/delegation-sidepanel-ui.test.js:41.',
    '',
  ];
}

function makeFixtureArtifact(kind) {
  const kindSections = kind === 'code'
    ? codeFixtureSections()
    : kind === 'security'
      ? securityFixtureSections()
      : uiFixtureSections();
  const citations = fixtureCitations(KIND_CONFIG[kind].minimumCitations + 2);
  return [
    frontmatterForFixture(kind),
    '',
    `# Phase 63 ${kind} fixture`,
    '',
    ...commonFixtureSections(kind),
    ...kindSections,
    '## Precomputed Plan 10 Evidence',
    '',
    `The precomputed Plan 10 evidence in scripts/run-phase63-focused-tests.mjs records 87/87, 200/200, 1015/1015, and 142/142. The precomputed remediation evidence records 101 platform/production CLI assertions, 125 platform/registration assertions, 229 install transaction assertions, 152 CLI-routing assertions, 54 bounded-output assertions, 229 diagnostics assertions, 229 daemon/entry assertions, 111 background-wake assertions, and the 1,014-assertion Phase 61–63 contract gate. This reviewer ran no commands; citations ${citations.join(', ')}.`,
    '',
    '## Findings',
    '',
    '| ID | Severity | Status | Resolution | Evidence |',
    '|---|---|---|---|---|',
    '| NONE | INFO | not-applicable | No source-actionable finding exists in this fixture disposition. | Reviewed evidence mcp/src/native-host/protocol.ts:1 supports the empty finding set. |',
    '',
    '## Residual Human Evidence Boundary',
    '',
    '63-HUMAN-UAT.md remains pending: real OS install and Chrome behavior, visual rendering, focus, and screen-reader evidence are exclusively human-owned.',
    '',
  ].join('\n');
}

function expectFixtureFailure(name, operation) {
  try {
    operation();
  } catch (error) {
    if (error instanceof ReviewVerificationError) return;
    throw error;
  }
  fail(`fixture negative did not fail: ${name}`);
}

function runFixtureSuite() {
  const valid = Object.fromEntries(
    Object.keys(KIND_CONFIG).map((kind) => [kind, makeFixtureArtifact(kind)]),
  );
  for (const kind of Object.keys(KIND_CONFIG)) {
    validateArtifact(kind, valid[kind], `fixture valid ${kind}`);
  }

  requireExactList(selectKinds([]), ['code', 'security', 'ui'], 'no-argument dispatch', 'fixtures');
  expectFixtureFailure('missing kind', () => selectKinds(['--kind']));
  expectFixtureFailure('unknown kind', () => selectKinds(['--kind', 'other']));
  expectFixtureFailure('extra arity', () => selectKinds(['--kind', 'code', 'extra']));
  expectFixtureFailure('stray flag', () => selectKinds(['--all']));
  expectFixtureFailure('missing artifact', () => validateArtifact('code', '', 'fixture missing artifact'));
  expectFixtureFailure('hash mismatch', () => validateArtifact(
    'code',
    valid.code.replace(IMPLEMENTATION_PATCH_SHA256, `0${IMPLEMENTATION_PATCH_SHA256.slice(1)}`),
    'fixture hash mismatch',
  ));
  expectFixtureFailure('extra output', () => validateArtifact(
    'code',
    valid.code.replace(
      `- \`${KIND_CONFIG.code.output}\`\n\n## Review Scope`,
      `- \`${KIND_CONFIG.code.output}\`\n- \`extra-output.md\`\n\n## Review Scope`,
    ),
    'fixture extra output',
  ));
  expectFixtureFailure('unknown severity', () => validateArtifact(
    'code',
    valid.code.replace('| NONE | INFO |', '| NONE | WARNING |'),
    'fixture unknown severity',
  ));
  expectFixtureFailure('unresolved HIGH', () => validateArtifact(
    'code',
    valid.code
      .replace('findings_high: 0', 'findings_high: 1')
      .replace('unresolved_high: 0', 'unresolved_high: 1')
      .replace(
        '| NONE | INFO | not-applicable | No source-actionable finding exists in this fixture disposition. | Reviewed evidence mcp/src/native-host/protocol.ts:1 supports the empty finding set. |',
        '| F63-CODE-01 | HIGH | open | Owning implementation plan must correct the blocking issue. | Evidence mcp/src/native-host/protocol.ts:1 demonstrates the issue. |',
      ),
    'fixture unresolved HIGH',
  ));
  expectFixtureFailure('false UAT', () => validateArtifact(
    'code',
    valid.code.replace('live_uat: pending', 'live_uat: passed'),
    'fixture false UAT',
  ));
}

function readArtifact(config) {
  try {
    return readFileSync(resolve(REPO_ROOT, config.output), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      fail(`${config.output}: artifact is missing`);
    }
    throw error;
  }
}

function sameIdentity(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function main() {
  const kinds = selectKinds(process.argv.slice(2));
  runFixtureSuite();
  const frozen = verifyFrozenImplementationIdentity();
  verifyReviewOutputScope(kinds);
  const identities = [];
  for (const kind of kinds) {
    const config = KIND_CONFIG[kind];
    const identity = validateArtifact(kind, readArtifact(config), config.output);
    identities.push(identity);
    console.log(`phase63 review artifact (${kind}): PASS`);
  }
  if (identities.length > 1) {
    for (const identity of identities.slice(1)) {
      if (!sameIdentity(identities[0], identity)) {
        fail('code, security, and UI artifacts do not share one implementation identity');
      }
    }
  }
  console.log('phase63 review fixture negatives: PASS (dispatch, missing kind/artifact, hash, output, severity, HIGH, UAT)');
  console.log(`phase63 implementation identity: PASS (${frozen.patchBytes} bytes, ${frozen.patchSha256})`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`phase63 review artifact verification: FAIL: ${message}`);
  process.exitCode = 1;
}
