/**
 * Phase 71 release-diff core (REL-02-c; CONTEXT D-24 and its 2026-10-16
 * amendment; D-02). Pure: no git, no file system, no process.
 *
 * V4 measures one commit. At V6 the release commit may differ from it only by
 * docs and by what the version setters write, so that nothing ships that was
 * not measured. scripts/release/check-release-diff.mjs exports the measured
 * tree, copies the release's docs into it, runs the step's setters, and then
 * asks judgeDifferences whether any remaining difference is allowed.
 *
 * Classification, first match wins:
 *   1. `*.md` at any depth                         -> 'docs'
 *   2. `showcase/server/**` (the Fly gateway, which deploy.yml ships on the V6
 *      merge and D-02 forbids Phase 71 to edit): a setter target -> 'setter'
 *      (its package.json and package-lock.json are extension-setter outputs),
 *      anything else -> 'forbidden'. This narrows D-24's `showcase/**`
 *      (M-71-00 item 5).
 *   3. the other docs prefixes                      -> 'docs' (docs wins over
 *      setter here, e.g. showcase/angular/public/llms.txt)
 *   4. a setter target (--print-targets)            -> 'setter'
 *   5. everything else                              -> 'forbidden'
 */

export const DOCS_ALLOWLIST = Object.freeze([
  '*.md',
  'showcase/**',
  'store-assets/**',
  'skills/**',
  '.planning/**',
  'scripts/bench/results/**',
  'scripts/bench/gate/decisions/**',
]);

// The deployed gateway: never docs apart from its *.md files.
export const GATEWAY_PREFIX = 'showcase/server/';

export const PATH_CLASSES = Object.freeze(['docs', 'setter', 'forbidden']);
export const STEPS = Object.freeze(['A', 'B']);

const DOCS_SUFFIX = '.md';
const DOCS_PREFIXES = Object.freeze(DOCS_ALLOWLIST
  .filter((pattern) => pattern.endsWith('/**'))
  .map((pattern) => pattern.slice(0, -2)));

const SHA_PATTERN = /^[0-9a-f]{40}$/;
// A git revision for --release: no leading dash (never read as an option),
// no whitespace, no colon (never a <rev>:<path> blob spec).
const REF_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._/@^~-]*$/;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function assertRepoPath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new TypeError('release-diff: a path must be a non-empty string');
  }
  if (relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.includes('\0')) {
    throw new TypeError(`release-diff: not a repository-relative path: ${JSON.stringify(relativePath)}`);
  }
  if (relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`release-diff: not a normalized repository path: ${JSON.stringify(relativePath)}`);
  }
}

function hasTarget(setterTargets, relativePath) {
  return setterTargets instanceof Set ? setterTargets.has(relativePath) : setterTargets.includes(relativePath);
}

export function isDocsPath(relativePath) {
  assertRepoPath(relativePath);
  if (relativePath.endsWith(DOCS_SUFFIX)) return true;
  if (relativePath.startsWith(GATEWAY_PREFIX)) return false;
  return DOCS_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

export function classifyPath(relativePath, { setterTargets } = {}) {
  assertRepoPath(relativePath);
  if (!(Array.isArray(setterTargets) || setterTargets instanceof Set)) {
    throw new TypeError('release-diff: classifyPath needs setterTargets (sync-product-version.mjs --print-targets)');
  }
  if (relativePath.endsWith(DOCS_SUFFIX)) return 'docs';
  if (relativePath.startsWith(GATEWAY_PREFIX)) {
    return hasTarget(setterTargets, relativePath) ? 'setter' : 'forbidden';
  }
  if (isDocsPath(relativePath)) return 'docs';
  if (hasTarget(setterTargets, relativePath)) return 'setter';
  return 'forbidden';
}

function lookup(map, key) {
  if (map instanceof Map) return map.get(key);
  if (map && Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new TypeError('release-diff: file contents must be bytes or a string');
}

// undefined means "absent on that side".
function sameBytes(a, b) {
  if (a === undefined || b === undefined) return a === b;
  return toBuffer(a).equals(toBuffer(b));
}

function presenceReason(before, after, beforeLabel) {
  if (before === undefined && after !== undefined) return 'added after the measured commit';
  if (before !== undefined && after === undefined) return 'deleted after the measured commit';
  return `changed after the measured commit${beforeLabel}`;
}

/**
 * paths: every path that may differ (the measured..release diff plus the
 * setter targets). classify: path -> 'docs' | 'setter' | 'forbidden'.
 * measured, release, afterSetter: Map or object of path -> bytes, where a
 * missing key means the file is absent there. afterSetter is the measured
 * tree after the release's docs were copied in and the step's setters ran.
 *
 * - docs: ignored;
 * - setter: passes only when afterSetter equals release byte for byte;
 * - forbidden: fails when measured and release differ or exist on one side;
 * - any other class fails closed.
 * Violations carry {path, class, reason} and never file contents.
 */
export function judgeDifferences({ paths, classify, measured, release, afterSetter }) {
  if (typeof classify !== 'function') throw new TypeError('release-diff: judgeDifferences needs classify');
  const ordered = [...new Set(paths)].sort();
  const violations = [];
  for (const relativePath of ordered) {
    const pathClass = classify(relativePath);
    if (pathClass === 'docs') continue;
    if (pathClass === 'setter') {
      const expected = lookup(afterSetter, relativePath);
      const actual = lookup(release, relativePath);
      if (!sameBytes(expected, actual)) {
        violations.push({
          path: relativePath,
          class: 'setter',
          reason: actual === undefined
            ? 'deleted after the measured commit'
            : (expected === undefined ? 'added after the measured commit' : 'differs from the setter output for this step'),
        });
      }
      continue;
    }
    if (pathClass === 'forbidden') {
      const before = lookup(measured, relativePath);
      const after = lookup(release, relativePath);
      if (!sameBytes(before, after)) {
        violations.push({ path: relativePath, class: 'forbidden', reason: presenceReason(before, after, '') });
      }
      continue;
    }
    violations.push({ path: relativePath, class: String(pathClass), reason: 'unclassified path' });
  }
  return { ok: violations.length === 0, violations };
}

/**
 * `git diff --no-renames --name-status -z <a> <b>` -> [{status, path}].
 * Status is the single letter (A, D, M, T); renames and copies are refused
 * because the CLI disables them.
 */
export function parseNameStatus(text) {
  if (typeof text !== 'string') throw new TypeError('release-diff: name-status output must be a string');
  const fields = text.split('\0');
  if (fields[fields.length - 1] === '') fields.pop();
  if (fields.length % 2 !== 0) throw new TypeError('release-diff: truncated name-status output');
  const entries = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const relativePath = fields[index + 1];
    if (!/^[ADMTUX]$/.test(status)) throw new TypeError(`release-diff: unexpected diff status ${JSON.stringify(status)}`);
    assertRepoPath(relativePath);
    entries.push({ status, path: relativePath });
  }
  return entries;
}

/**
 * --measured <40-hex sha> --step A|B [--release <ref>, default HEAD]
 * [--help]. Anything else throws UsageError.
 */
export function parseArgs(argv) {
  const options = { help: false, measured: null, step: null, release: null };
  const seen = new Set();
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--help' || flag === '-h') {
      options.help = true;
      continue;
    }
    if (!['--measured', '--step', '--release'].includes(flag)) throw new UsageError(`unknown argument: ${flag}`);
    if (seen.has(flag)) throw new UsageError(`${flag} given twice`);
    seen.add(flag);
    if (args.length === 0) throw new UsageError(`${flag} needs a value`);
    const value = args.shift();
    if (flag === '--measured') {
      if (!SHA_PATTERN.test(value)) throw new UsageError('--measured must be a full 40-character lowercase commit sha');
      options.measured = value;
    } else if (flag === '--step') {
      if (!STEPS.includes(value)) throw new UsageError('--step must be A or B');
      options.step = value;
    } else {
      if (!REF_PATTERN.test(value)) throw new UsageError('--release must be a commit reference such as HEAD or origin/main');
      options.release = value;
    }
  }
  if (options.help) return { help: true, measured: options.measured, step: options.step, release: options.release || 'HEAD' };
  if (!options.measured) throw new UsageError('--measured <sha> is required');
  if (!options.step) throw new UsageError('--step A|B is required');
  return { help: false, measured: options.measured, step: options.step, release: options.release || 'HEAD' };
}
