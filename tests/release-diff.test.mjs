// Phase 71 Plan 09 Task 2 (REL-02-c; CONTEXT D-24 and its 2026-10-16
// amendment, D-02): the release-diff checker that ties what ships at V6 to
// the tree V4 measured.
//
// The pure classifier, the byte comparison and the argument parser are tested
// directly. The CLI's git flow is tested only up to its refusals, through an
// injected fake runChecked that records calls and returns scripted results,
// so nothing spawns and no test runs git (CI clones are shallow,
// 67-VALIDATION:27). The real export, setter run and comparison are proven by
// the local manual smoke recorded in 71-09-SUMMARY.md.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { main } from '../scripts/release/check-release-diff.mjs';
import {
  DOCS_ALLOWLIST,
  classifyPath,
  isDocsPath,
  judgeDifferences,
  parseArgs,
  parseNameStatus,
} from '../scripts/release/lib/release-diff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURED_SHA = '1111111111111111111111111111111111111111';
const HEAD_SHA = '2222222222222222222222222222222222222222';
const OTHER_SHA = '3333333333333333333333333333333333333333';

// A copy of `node scripts/sync-product-version.mjs --print-targets` (2026-10-19).
const SETTER_TARGETS = Object.freeze([
  '.github/workflows/chrome-extension.yml',
  '.github/workflows/npm-publish.yml',
  'CHANGELOG.md',
  'README.md',
  'extension/README.md',
  'extension/manifest.json',
  'extension/ui/onboarding.js',
  'extension/ui/options.js',
  'extension/ui/sidepanel.js',
  'mcp/CHANGELOG.md',
  'mcp/README.md',
  'mcp/build/version.d.ts',
  'mcp/build/version.js',
  'mcp/native-host/runtime-integrity.json',
  'mcp/package-lock.json',
  'mcp/package.json',
  'mcp/server.json',
  'mcp/src/index.ts',
  'mcp/src/install.ts',
  'mcp/src/platforms.ts',
  'mcp/src/version.ts',
  'package-lock.json',
  'package.json',
  'showcase/about.html',
  'showcase/angular/package-lock.json',
  'showcase/angular/package.json',
  'showcase/angular/public/llms-full.txt',
  'showcase/angular/public/llms.txt',
  'showcase/angular/scripts/llms-full.source.md',
  'showcase/angular/scripts/llms.source.md',
  'showcase/angular/src/app/core/seo/version.ts',
  'showcase/server/package-lock.json',
  'showcase/server/package.json',
  'skills/fsb/SKILL.md',
  'skills/fsb/references/multi-agent-contract.md',
  'store-assets/chrome-web-store/listing-copy.md',
]);
const SETTERS = Object.freeze({ setterTargets: SETTER_TARGETS });
const classify = (relativePath) => classifyPath(relativePath, SETTERS);

test('the setterTargets fixture names only paths the real setter declares', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-product-version.mjs'), 'utf8');
  const missing = SETTER_TARGETS.filter((target) => !source.includes(`'${target}'`));
  assert.deepEqual(missing, []);
  assert.ok(SETTER_TARGETS.includes('showcase/server/package.json'));
  assert.ok(SETTER_TARGETS.includes('showcase/server/package-lock.json'));
  assert.ok(SETTER_TARGETS.includes('showcase/angular/public/llms.txt'));
});

test('DOCS_ALLOWLIST is exactly the D-24 list', () => {
  assert.deepEqual([...DOCS_ALLOWLIST], [
    '*.md',
    'showcase/**',
    'store-assets/**',
    'skills/**',
    '.planning/**',
    'scripts/bench/results/**',
    'scripts/bench/gate/decisions/**',
  ]);
  assert.ok(Object.isFrozen(DOCS_ALLOWLIST));
});

test('classifyPath: docs paths', () => {
  for (const docsPath of [
    'README.md',
    'mcp/README.md',
    'mcp/CHANGELOG.md',
    'CHANGELOG.md',
    'extension/docs/deep/nested/notes.md',
    'showcase/server/README.md',
    'showcase/server/docs/ops.md',
    'showcase/angular/src/locale/messages.de.xlf',
    'showcase/angular/public/llms.txt',
    'showcase/angular/package.json',
    'store-assets/x.png',
    'skills/fsb/SKILL.md',
    '.planning/x',
    'scripts/bench/results/core-gate-71-claude/runs.jsonl',
    'scripts/bench/gate/decisions/core-gate-71.json',
  ]) {
    assert.equal(classify(docsPath), 'docs', docsPath);
    assert.equal(isDocsPath(docsPath), true, docsPath);
  }
});

test('classifyPath: setter targets outside the docs allowlist are setter', () => {
  for (const setterPath of [
    'package.json',
    'package-lock.json',
    'extension/manifest.json',
    'mcp/package.json',
    'mcp/build/version.js',
    'mcp/src/version.ts',
    'extension/ui/onboarding.js',
  ]) {
    assert.equal(classify(setterPath), 'setter', setterPath);
  }
});

test('classifyPath: the two showcase/server extension-setter outputs are setter, never forbidden or docs', () => {
  assert.equal(classify('showcase/server/package.json'), 'setter');
  assert.equal(classify('showcase/server/package-lock.json'), 'setter');
  assert.equal(isDocsPath('showcase/server/package.json'), false);
});

test('classifyPath: forbidden paths', () => {
  for (const forbiddenPath of [
    'extension/background.js',
    'mcp/src/tools/manual.ts',
    'scripts/bench/gate/lib/evaluate.mjs',
    'scripts/bench/gate/release-gate-v1.0.0.json',
    'mcp/build/index.js',
    'showcase/server/src/jev/contract.js',
    'showcase/server/server.js',
    'scripts/release/check-release-diff.mjs',
    'scripts/sync-product-version.mjs',
    'tests/release-diff.test.mjs',
  ]) {
    assert.equal(classify(forbiddenPath), 'forbidden', forbiddenPath);
  }
});

test('classifyPath: docs wins over setter outside showcase/server; showcase/server beats the showcase docs prefix', () => {
  assert.ok(SETTER_TARGETS.includes('README.md'));
  assert.equal(classify('README.md'), 'docs');
  assert.ok(SETTER_TARGETS.includes('showcase/angular/public/llms.txt'));
  assert.equal(classify('showcase/angular/public/llms.txt'), 'docs');
  assert.equal(classify('showcase/server/server.js'), 'forbidden');
  assert.equal(classifyPath('showcase/server/package.json', { setterTargets: [] }), 'forbidden',
    'a showcase/server path that is not a setter target is forbidden');
  assert.equal(classifyPath('showcase/server/package.json', { setterTargets: new Set(SETTER_TARGETS) }), 'setter',
    'a Set of setter targets works too');
});

test('classifyPath: refuses malformed input instead of guessing', () => {
  for (const bad of ['', '/etc/passwd', '../x.js', 'a/../b.js', 'a//b.js', 'a\\b.js', 42, null]) {
    assert.throws(() => classifyPath(bad, SETTERS), TypeError, String(bad));
  }
  assert.throws(() => classifyPath('package.json', {}), TypeError);
});

function bytes(text) {
  return Buffer.from(text, 'utf8');
}

const MANIFEST_0992 = bytes('{\n  "name": "FSB v0.9.92",\n  "version": "0.9.92"\n}\n');
const MANIFEST_100 = bytes('{\n  "name": "FSB v1.0.0",\n  "version": "1.0.0"\n}\n');
const SERVER_PKG_0992 = bytes('{\n  "name": "fsb-server",\n  "version": "0.9.92",\n  "dependencies": {}\n}\n');
const SERVER_PKG_100 = bytes('{\n  "name": "fsb-server",\n  "version": "1.0.0",\n  "dependencies": {}\n}\n');
const SERVER_PKG_100_DEP = bytes('{\n  "name": "fsb-server",\n  "version": "1.0.0",\n  "dependencies": {\n    "left-pad": "1.3.0"\n  }\n}\n');
const SERVER_LOCK_0992 = bytes('{\n  "name": "fsb-server",\n  "version": "0.9.92",\n  "packages": {\n    "": {\n      "version": "0.9.92"\n    }\n  }\n}\n');
const SERVER_LOCK_100 = bytes('{\n  "name": "fsb-server",\n  "version": "1.0.0",\n  "packages": {\n    "": {\n      "version": "1.0.0"\n    }\n  }\n}\n');

function judge({ paths, measured = {}, release = {}, afterSetter = {} }) {
  return judgeDifferences({ paths, classify, measured, release, afterSetter });
}

test('judgeDifferences: a docs path is ignored, whatever its bytes', () => {
  const result = judge({
    paths: ['CHANGELOG.md', 'mcp/README.md', 'scripts/bench/gate/decisions/core-gate-71.json'],
    measured: { 'CHANGELOG.md': bytes('a'), 'mcp/README.md': bytes('old') },
    release: { 'CHANGELOG.md': bytes('b'), 'mcp/README.md': bytes('new'), 'scripts/bench/gate/decisions/core-gate-71.json': bytes('{}') },
    afterSetter: { 'CHANGELOG.md': bytes('b'), 'mcp/README.md': bytes('different') },
  });
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('judgeDifferences: extension/manifest.json changed exactly as the setter writes passes', () => {
  const result = judge({
    paths: ['extension/manifest.json'],
    measured: { 'extension/manifest.json': MANIFEST_0992 },
    release: { 'extension/manifest.json': MANIFEST_100 },
    afterSetter: { 'extension/manifest.json': bytes(MANIFEST_100.toString('utf8')) },
  });
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('judgeDifferences: an onboarding.js edit after V4 that the setter did not make is a setter violation', () => {
  const measured = bytes('const version = chrome.runtime.getManifest().version;\n');
  const result = judge({
    paths: ['extension/ui/onboarding.js'],
    measured: { 'extension/ui/onboarding.js': measured },
    release: { 'extension/ui/onboarding.js': bytes('const version = chrome.runtime.getManifest().version;\nconst copy = "73 tools";\n') },
    afterSetter: { 'extension/ui/onboarding.js': measured },
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].path, 'extension/ui/onboarding.js');
  assert.equal(result.violations[0].class, 'setter');
  assert.match(result.violations[0].reason, /setter/);
});

test('judgeDifferences: showcase/server package.json and package-lock.json bumped exactly as the extension setter writes pass (V6 step A and B shape)', () => {
  const result = judge({
    paths: ['showcase/server/package.json', 'showcase/server/package-lock.json', 'extension/manifest.json'],
    measured: {
      'showcase/server/package.json': SERVER_PKG_0992,
      'showcase/server/package-lock.json': SERVER_LOCK_0992,
      'extension/manifest.json': MANIFEST_0992,
    },
    release: {
      'showcase/server/package.json': SERVER_PKG_100,
      'showcase/server/package-lock.json': SERVER_LOCK_100,
      'extension/manifest.json': MANIFEST_100,
    },
    afterSetter: {
      'showcase/server/package.json': SERVER_PKG_100,
      'showcase/server/package-lock.json': SERVER_LOCK_100,
      'extension/manifest.json': MANIFEST_100,
    },
  });
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('judgeDifferences: showcase/server/package.json with any other change (an added dependency) is a setter violation', () => {
  const result = judge({
    paths: ['showcase/server/package.json', 'showcase/server/package-lock.json'],
    measured: { 'showcase/server/package.json': SERVER_PKG_0992, 'showcase/server/package-lock.json': SERVER_LOCK_0992 },
    release: { 'showcase/server/package.json': SERVER_PKG_100_DEP, 'showcase/server/package-lock.json': SERVER_LOCK_100 },
    afterSetter: { 'showcase/server/package.json': SERVER_PKG_100, 'showcase/server/package-lock.json': SERVER_LOCK_100 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => [violation.path, violation.class]),
    [['showcase/server/package.json', 'setter']]);
});

test('judgeDifferences: a new non-docs file only in the release is a forbidden violation', () => {
  const result = judge({
    paths: ['extension/ai/x.js'],
    release: { 'extension/ai/x.js': bytes('module.exports = 1;\n') },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => [violation.path, violation.class]), [['extension/ai/x.js', 'forbidden']]);
  assert.match(result.violations[0].reason, /added/);
});

test('judgeDifferences: a non-docs file deleted in the release is a violation', () => {
  const result = judge({
    paths: ['extension/background.js'],
    measured: { 'extension/background.js': bytes('x') },
    afterSetter: { 'extension/background.js': bytes('x') },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => [violation.path, violation.class]), [['extension/background.js', 'forbidden']]);
  assert.match(result.violations[0].reason, /deleted/);
});

test('judgeDifferences: a new decision file under scripts/bench/gate/decisions passes', () => {
  const result = judge({
    paths: ['scripts/bench/gate/decisions/core-gate-71.json'],
    release: { 'scripts/bench/gate/decisions/core-gate-71.json': bytes('{"paths":[]}\n') },
  });
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('judgeDifferences: a changed showcase/server/src/jev/contract.js is a forbidden violation', () => {
  const result = judge({
    paths: ['showcase/server/src/jev/contract.js'],
    measured: { 'showcase/server/src/jev/contract.js': bytes('a') },
    release: { 'showcase/server/src/jev/contract.js': bytes('b') },
    afterSetter: { 'showcase/server/src/jev/contract.js': bytes('a') },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => [violation.path, violation.class]),
    [['showcase/server/src/jev/contract.js', 'forbidden']]);
  assert.match(result.violations[0].reason, /changed/);
});

test('judgeDifferences: step A with mcp/README.md changed (setter compatibility line, M-71-11b docs fallback) passes', () => {
  const result = judge({
    paths: ['mcp/README.md', 'mcp/CHANGELOG.md', 'extension/manifest.json'],
    measured: { 'mcp/README.md': bytes('MCP 0.11.2 requires extension 0.9.92 or newer\n'), 'extension/manifest.json': MANIFEST_0992 },
    release: { 'mcp/README.md': bytes('Tools (72 Total)\n'), 'mcp/CHANGELOG.md': bytes('x'), 'extension/manifest.json': MANIFEST_100 },
    afterSetter: { 'mcp/README.md': bytes('MCP 0.11.2 requires extension 0.9.92 or newer\n'), 'extension/manifest.json': MANIFEST_100 },
  });
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('judgeDifferences: step A with mcp/package.json changed while the step-A setters left it as measured is a violation', () => {
  const measured = bytes('{\n  "version": "0.11.2"\n}\n');
  const result = judge({
    paths: ['mcp/package.json'],
    measured: { 'mcp/package.json': measured },
    release: { 'mcp/package.json': bytes('{\n  "version": "0.12.0"\n}\n') },
    afterSetter: { 'mcp/package.json': measured },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => [violation.path, violation.class]), [['mcp/package.json', 'setter']]);
});

test('judgeDifferences: accepts Map inputs, reports violations in path order and fails closed on an unknown class', () => {
  const result = judgeDifferences({
    paths: ['z.js', 'a.js', 'a.js'],
    classify: () => 'forbidden',
    measured: new Map([['a.js', bytes('1')], ['z.js', bytes('1')]]),
    release: new Map([['a.js', bytes('2')], ['z.js', bytes('2')]]),
    afterSetter: new Map(),
  });
  assert.deepEqual(result.violations.map((violation) => violation.path), ['a.js', 'z.js']);
  const unknown = judgeDifferences({
    paths: ['a.js'],
    classify: () => 'mystery',
    measured: {},
    release: {},
    afterSetter: {},
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.violations[0].class, 'mystery');
});

test('parseNameStatus reads git diff --no-renames --name-status -z output', () => {
  const text = 'M\0package.json\0A\0scripts/release/lib/release-diff.mjs\0D\0old file.js\0T\0link\0';
  assert.deepEqual(parseNameStatus(text), [
    { status: 'M', path: 'package.json' },
    { status: 'A', path: 'scripts/release/lib/release-diff.mjs' },
    { status: 'D', path: 'old file.js' },
    { status: 'T', path: 'link' },
  ]);
  assert.deepEqual(parseNameStatus(''), []);
  assert.throws(() => parseNameStatus('M\0'), TypeError);
  assert.throws(() => parseNameStatus('R100\0a\0b\0'), TypeError);
});

test('parseArgs: --release defaults to HEAD', () => {
  assert.equal(parseArgs(['--measured', MEASURED_SHA, '--step', 'A']).release, 'HEAD');
  assert.deepEqual(parseArgs(['--step', 'B', '--measured', MEASURED_SHA, '--release', 'origin/main']),
    { help: false, measured: MEASURED_SHA, step: 'B', release: 'origin/main' });
  assert.equal(parseArgs(['--help']).help, true);
});

test('parseArgs: anything else is a usage error', () => {
  for (const argv of [
    [],
    ['--step', 'A'],
    ['--measured', MEASURED_SHA],
    ['--measured', 'abc123', '--step', 'A'],
    ['--measured', `${MEASURED_SHA}0`, '--step', 'A'],
    ['--measured', MEASURED_SHA, '--step', 'C'],
    ['--measured', MEASURED_SHA, '--step', 'a'],
    ['--measured', MEASURED_SHA, '--step'],
    ['--measured', MEASURED_SHA, '--step', 'A', '--release'],
    ['--measured', MEASURED_SHA, '--step', 'A', '--release', '--force'],
    ['--measured', MEASURED_SHA, '--step', 'A', '--release', 'a b'],
    ['--measured', MEASURED_SHA, '--step', 'A', '--step', 'B'],
    ['--measured', MEASURED_SHA, '--step', 'A', '--worktree'],
    ['--measured', MEASURED_SHA, '--step', 'A', 'extra'],
  ]) {
    assert.throws(() => parseArgs(argv), { name: 'UsageError' }, JSON.stringify(argv));
  }
});

function captureIo() {
  const out = [];
  const err = [];
  return { out, err, stdout: (text) => out.push(text), stderr: (text) => err.push(text) };
}

// A fake runChecked: records [command, ...args] and answers from a script.
// Nothing spawns.
function fakeGit({ revParse = {}, diffQuietStatus = 0, ancestorStatus = 1 } = {}) {
  const calls = [];
  const runChecked = (command, args) => {
    calls.push([command, ...args]);
    if (command !== 'git') throw new Error(`unexpected command ${command}`);
    const [sub] = args;
    if (sub === 'rev-parse') {
      const ref = String(args[args.length - 1]).replace(/\^\{commit\}$/, '');
      const sha = revParse[ref] || HEAD_SHA;
      return { status: 0, stdout: Buffer.from(`${sha}\n`), stderr: Buffer.alloc(0) };
    }
    if (sub === 'diff' && args.includes('--quiet')) return { status: diffQuietStatus, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    if (sub === 'merge-base') return { status: ancestorStatus, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    throw new Error(`unscripted git call: ${args.join(' ')}`);
  };
  return { calls, runChecked };
}

test('uncommitted refusal: release defaults to HEAD and tracked changes are uncommitted -> exit 2, uncommitted_changes, no export', async () => {
  const git = fakeGit({ diffQuietStatus: 1 });
  const io = captureIo();
  const code = await main(['--measured', MEASURED_SHA, '--step', 'A'], { runChecked: git.runChecked, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.match(io.err.join(''), /uncommitted_changes/);
  assert.equal(git.calls.some((call) => call[1] === 'archive'), false, 'no archive call');
  assert.equal(git.calls.some((call) => call[1] === 'merge-base'), false, 'refused before the ancestor check');
  const diffCall = git.calls.find((call) => call[1] === 'diff');
  assert.deepEqual(diffCall, ['git', 'diff', '--quiet', 'HEAD']);
  const revParse = git.calls.find((call) => call[1] === 'rev-parse');
  assert.deepEqual(revParse, ['git', 'rev-parse', '--verify', 'HEAD^{commit}']);
});

test('uncommitted refusal: a clean tree goes on to the merge-base --is-ancestor check next', async () => {
  const git = fakeGit({ diffQuietStatus: 0, ancestorStatus: 1 });
  const io = captureIo();
  const code = await main(['--measured', MEASURED_SHA, '--step', 'A'], { runChecked: git.runChecked, stdout: io.stdout, stderr: io.stderr });
  const diffIndex = git.calls.findIndex((call) => call[1] === 'diff' && call.includes('--quiet'));
  assert.ok(diffIndex >= 0);
  assert.deepEqual(git.calls[diffIndex + 1], ['git', 'merge-base', '--is-ancestor', MEASURED_SHA, HEAD_SHA]);
  assert.equal(code, 2, 'the scripted merge-base answers "not an ancestor"');
  assert.match(io.err.join(''), /measured_not_ancestor/);
  assert.equal(git.calls.some((call) => call[1] === 'archive'), false, 'no archive call');
  assert.doesNotMatch(io.err.join(''), /uncommitted_changes/);
  assert.match(io.out.join(''), new RegExp(HEAD_SHA), 'the resolved release sha is printed');
});

test('uncommitted refusal applies only when the release is HEAD\'s commit', async () => {
  const git = fakeGit({ revParse: { 'origin/main': OTHER_SHA, HEAD: HEAD_SHA }, diffQuietStatus: 1, ancestorStatus: 1 });
  const io = captureIo();
  const code = await main(['--measured', MEASURED_SHA, '--step', 'B', '--release', 'origin/main'],
    { runChecked: git.runChecked, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.equal(git.calls.some((call) => call[1] === 'diff' && call.includes('--quiet')), false,
    'a release that is not HEAD is a commit, so the working tree is irrelevant');
  assert.deepEqual(git.calls[git.calls.length - 1], ['git', 'merge-base', '--is-ancestor', MEASURED_SHA, OTHER_SHA]);
  assert.match(io.err.join(''), /measured_not_ancestor/);
});

test('usage errors exit 2 before any git call', async () => {
  const git = fakeGit();
  const io = captureIo();
  assert.equal(await main(['--step', 'C'], { runChecked: git.runChecked, stdout: io.stdout, stderr: io.stderr }), 2);
  assert.equal(git.calls.length, 0);
  assert.match(io.err.join(''), /usage/i);
});
