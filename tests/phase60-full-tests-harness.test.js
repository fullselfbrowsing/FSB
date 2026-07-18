'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const harnessPath = path.join(repoRoot, 'scripts', 'run-phase60-full-tests.mjs');

function runGit(repository, args) {
  const environment = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete environment[name];
  const result = spawnSync('git', args, {
    cwd: repository,
    env: environment,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function resolveGitIndex(repository) {
  const rawPath = runGit(repository, ['rev-parse', '--git-path', 'index']).trim();
  assert.equal(rawPath.length > 0, true, 'fixture Git index path is non-empty');
  return path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(repository, rawPath);
}

function write(repository, relativePath, value) {
  const target = path.join(repository, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function findExecutable(name) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep searching the configured PATH.
    }
  }
  throw new Error('unable to locate executable: ' + name);
}

function main() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-phase60-harness-'));
  const compatibilityDirectory = path.join(
    repository,
    '.planning',
    'phases',
    '39-breadth-c-commerce-travel-misc-most-sensitive',
  );
  const compatibilityPath = path.join(compatibilityDirectory, '39-06-REMAINING-APPS.md');
  try {
    runGit(repository, ['init', '--quiet']);
    runGit(repository, ['config', 'user.email', 'phase60@example.invalid']);
    runGit(repository, ['config', 'user.name', 'Phase 60 Harness']);
    write(repository, '.planning/phases/.gitkeep', '');
    write(
      repository,
      '.planning/milestones/v1.0.0-phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md',
      'archived compatibility bytes\n',
    );
    write(repository, 'clean.txt', 'committed clean baseline\n');
    write(repository, 'stat-cache-clean.txt', 'committed stat-cache baseline\n');
    write(repository, 'dirty.txt', 'committed dirty baseline\n');
    write(repository, 'staged.txt', 'committed staged baseline\n');
    write(repository, 'conflict.txt', 'committed conflict baseline\n');
    write(
      repository,
      'showcase/angular/public/llms.txt',
      '<!-- generated 2026-07-07 by build-crawler-files.mjs -->\n',
    );
    runGit(repository, ['add', '--all']);
    runGit(repository, ['commit', '--quiet', '-m', 'fixture baseline']);

    write(repository, 'dirty.txt', 'user dirty bytes\n');
    write(repository, 'staged.txt', 'user staged bytes\n');
    write(
      repository,
      'showcase/angular/public/llms.txt',
      '<!-- generated 2026-07-14 by build-crawler-files.mjs -->\n',
    );
    runGit(repository, ['add', '--', 'staged.txt']);
    const intentToAddPath = 'intent space\nline.txt';
    write(repository, intentToAddPath, '');
    runGit(repository, ['add', '-N', '--', intentToAddPath]);

    function runHarness(childSource, options = {}) {
      const testRepository = options.repositoryRoot || repository;
      const environment = {
        ...process.env,
        ...(options.environment || {}),
        FSB_PHASE60_INJECT_FAILURE: '',
        FSB_PHASE60_TEST_REPOSITORY_ROOT: testRepository,
        FSB_PHASE60_TEST_COMMAND_JSON: JSON.stringify([
          process.execPath,
          '-e',
          childSource,
        ]),
      };
      for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete environment[name];
      return spawnSync(process.execPath, [harnessPath], {
        cwd: repoRoot,
        env: environment,
        encoding: 'utf8',
        shell: false,
      });
    }

    const restoredDirtySource = [
      "const fs = require('node:fs');",
      "fs.writeFileSync('dirty.txt', 'child overwrote dirty bytes\\n');",
      "fs.writeFileSync('showcase/angular/public/llms.txt', '<!-- generated 2026-07-15 by build-crawler-files.mjs -->\\n');",
    ].join('\n');
    const restored = runHarness(restoredDirtySource);

    assert.equal(restored.status, 0,
      `pre-existing dirty worktree mutation is restored: ${restored.stderr}`);
    assert.match(restored.stdout, /PASS: full suite passed and workspace state was preserved/);
    assert.doesNotMatch(restored.stderr, /index semantic identity changed/);
    assert.doesNotMatch(restored.stderr, /pre-existing tracked dirty bytes changed/);
    assert.equal(fs.existsSync(compatibilityPath), false, 'harness removes only its compatibility symlink');
    assert.equal(fs.existsSync(compatibilityDirectory), false, 'harness removes its newly-created compatibility directory');
    assert.equal(
      fs.readFileSync(path.join(repository, 'dirty.txt'), 'utf8'),
      'user dirty bytes\n',
      'harness restores overwritten dirty bytes from its in-memory snapshot',
    );
    assert.equal(
      runGit(repository, ['show', ':staged.txt']),
      'user staged bytes\n',
      'harness leaves pre-existing staged index bytes unchanged',
    );
    assert.equal(
      fs.readFileSync(path.join(repository, 'staged.txt'), 'utf8'),
      'user staged bytes\n',
      'harness leaves the staged path worktree bytes unchanged',
    );
    assert.equal(
      fs.readFileSync(path.join(repository, 'showcase/angular/public/llms.txt'), 'utf8'),
      '<!-- generated 2026-07-14 by build-crawler-files.mjs -->\n',
      'date-sensitive generated dirty bytes are restored exactly',
    );

    const indexPath = resolveGitIndex(repository);
    const indexBytesBeforeStatRefresh = fs.readFileSync(indexPath);
    const indexModeBeforeStatRefresh = fs.lstatSync(indexPath).mode & 0o7777;
    const statRefreshSource = [
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const environment = { ...process.env };",
      "delete environment.GIT_OPTIONAL_LOCKS;",
      "const resolved = spawnSync('git', ['rev-parse', '--git-path', 'index'], { encoding: 'utf8', env: environment, shell: false });",
      "if (resolved.status !== 0 || !resolved.stdout.trim()) process.exit(92);",
      "const indexPath = path.resolve(resolved.stdout.trim());",
      "const indexBefore = fs.readFileSync(indexPath);",
      "const target = 'stat-cache-clean.txt';",
      "const before = fs.statSync(target);",
      "fs.utimesSync(target, before.atime, new Date(before.mtimeMs + 2000));",
      "const refreshed = spawnSync('git', ['status', '--short', '--', target], { env: environment, shell: false });",
      "if (refreshed.status !== 0) process.exit(93);",
      "if (fs.readFileSync(indexPath).equals(indexBefore)) process.exit(94);",
    ].join('\n');
    const statRefresh = runHarness(statRefreshSource);
    assert.equal(
      statRefresh.status,
      0,
      `stat-cache-only index refresh remains a successful preserved run: ${statRefresh.stderr}`,
    );
    assert.match(statRefresh.stdout, /PASS: full suite passed and workspace state was preserved/);
    assert.deepEqual(
      fs.readFileSync(indexPath),
      indexBytesBeforeStatRefresh,
      'harness restores raw index bytes after a child-only Git stat-cache refresh',
    );
    assert.equal(
      fs.lstatSync(indexPath).mode & 0o7777,
      indexModeBeforeStatRefresh,
      'harness preserves raw index mode after a child-only Git stat-cache refresh',
    );

    const lockContentionSource = [
      statRefreshSource,
      "fs.writeFileSync(indexPath + '.lock', 'foreign git lock\\n');",
    ].join('\n');
    const lockContention = runHarness(lockContentionSource);
    assert.equal(lockContention.status, 1, 'an existing Git index lock blocks raw restoration');
    assert.match(lockContention.stderr, /raw Git index lock is already held/);
    assert.equal(
      fs.readFileSync(`${indexPath}.lock`, 'utf8'),
      'foreign git lock\n',
      'harness never clobbers an existing Git index lock',
    );
    assert.notDeepEqual(
      fs.readFileSync(indexPath),
      indexBytesBeforeStatRefresh,
      'lock contention leaves the concurrently refreshed index untouched',
    );
    fs.unlinkSync(`${indexPath}.lock`);
    fs.writeFileSync(indexPath, indexBytesBeforeStatRefresh);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    if (process.platform !== 'win32') {
      const indexBeforeInitialCaptureRace = fs.readFileSync(indexPath);
      const raceShimDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-phase60-git-shim-'));
      const raceSentinel = path.join(raceShimDirectory, 'staged-once');
      const gitShimPath = path.join(raceShimDirectory, 'git');
      const realGit = findExecutable('git');
      fs.writeFileSync(gitShimPath, [
        '#!/usr/bin/env node',
        "'use strict';",
        "const { spawnSync } = require('node:child_process');",
        "const fs = require('node:fs');",
        "const args = process.argv.slice(2);",
        "const environment = { ...process.env };",
        "if (!fs.existsSync(environment.FSB_PHASE60_RACE_SENTINEL)",
        "  && args[0] === 'diff'",
        "  && args.includes('--name-only')",
        "  && !args.includes('--cached')) {",
        "  fs.writeFileSync(environment.FSB_PHASE60_RACE_SENTINEL, 'staged\\n');",
        "  const staged = spawnSync(environment.FSB_PHASE60_REAL_GIT, ['add', '--', 'clean.txt'], { env: environment, shell: false });",
        "  if (staged.status !== 0) process.exit(121);",
        "}",
        "const delegated = spawnSync(environment.FSB_PHASE60_REAL_GIT, args, { env: environment, stdio: 'inherit', shell: false });",
        "if (delegated.signal) process.kill(process.pid, delegated.signal);",
        "process.exit(Number.isInteger(delegated.status) ? delegated.status : 122);",
        '',
      ].join('\n'));
      fs.chmodSync(gitShimPath, 0o755);
      write(repository, 'clean.txt', 'concurrently staged during initial capture\n');
      try {
        const initialCaptureRace = runHarness('void 0;', {
          environment: {
            PATH: raceShimDirectory + path.delimiter + (process.env.PATH || ''),
            FSB_PHASE60_RACE_SENTINEL: raceSentinel,
            FSB_PHASE60_REAL_GIT: realGit,
          },
        });
        assert.equal(
          initialCaptureRace.status,
          0,
          'stable initial capture retries around a concurrent Git writer: '
            + initialCaptureRace.stderr,
        );
        assert.match(
          initialCaptureRace.stdout,
          /PASS: full suite passed and workspace state was preserved/,
        );
        assert.equal(
          runGit(repository, ['show', ':clean.txt']),
          'concurrently staged during initial capture\n',
          'harness accepts and preserves the stable index created by the concurrent writer',
        );
        assert.notDeepEqual(
          fs.readFileSync(indexPath),
          indexBeforeInitialCaptureRace,
          'concurrent staging is never overwritten with the earlier raw index snapshot',
        );
      } finally {
        fs.rmSync(raceShimDirectory, { recursive: true, force: true });
        fs.writeFileSync(indexPath, indexBeforeInitialCaptureRace);
        fs.chmodSync(indexPath, indexModeBeforeStatRefresh);
        write(repository, 'clean.txt', 'committed clean baseline\n');
      }
    }

    const intentToAddDebug = runGit(
      repository,
      ['ls-files', '--cached', '--debug', '--', intentToAddPath],
    );
    const intentToAddFlagMatch = /\tflags: ([0-9a-f]+)\n?$/.exec(intentToAddDebug);
    assert.notEqual(intentToAddFlagMatch, null, 'fixture exposes Git debug flags as hexadecimal');
    assert.notEqual(
      BigInt(`0x${intentToAddFlagMatch[1]}`) & 0x20000000n,
      0n,
      'fixture starts with CE_INTENT_TO_ADD set',
    );
    const indexBeforeIntentConversion = fs.readFileSync(indexPath);
    const intentConversion = runHarness([
      "const { spawnSync } = require('node:child_process');",
      "const environment = { ...process.env };",
      "delete environment.GIT_OPTIONAL_LOCKS;",
      `const added = spawnSync('git', ['add', '--', ${JSON.stringify(intentToAddPath)}], { env: environment, shell: false });`,
      "if (added.status !== 0) process.exit(98);",
    ].join('\n'));
    assert.equal(intentConversion.status, 1, 'intent-to-add conversion fails closed');
    assert.match(intentConversion.stderr, /index semantic identity changed/);
    assert.notDeepEqual(
      fs.readFileSync(indexPath),
      indexBeforeIntentConversion,
      'harness detects but does not overwrite the converted intent-to-add entry',
    );
    const ordinaryEmptyDebug = runGit(
      repository,
      ['ls-files', '--cached', '--debug', '--', intentToAddPath],
    );
    const ordinaryEmptyFlagMatch = /\tflags: ([0-9a-f]+)\n?$/.exec(ordinaryEmptyDebug);
    assert.notEqual(ordinaryEmptyFlagMatch, null, 'converted entry still exposes debug flags');
    assert.equal(
      BigInt(`0x${ordinaryEmptyFlagMatch[1]}`) & 0x20000000n,
      0n,
      'ordinary staged empty blob clears CE_INTENT_TO_ADD',
    );
    fs.writeFileSync(indexPath, indexBeforeIntentConversion);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const baseConflictObject = runGit(repository, ['rev-parse', 'HEAD:conflict.txt']).trim();
    const oursConflictObject = runGit(repository, ['rev-parse', 'HEAD:clean.txt']).trim();
    const theirsConflictObject = runGit(repository, ['rev-parse', 'HEAD:dirty.txt']).trim();
    const zeroObject = '0'.repeat(baseConflictObject.length);
    const conflictIndexInfo = [
      `0 ${zeroObject}\tconflict.txt`,
      `100644 ${baseConflictObject} 1\tconflict.txt`,
      `100644 ${oursConflictObject} 2\tconflict.txt`,
      `100644 ${theirsConflictObject} 3\tconflict.txt`,
      '',
    ].join('\n');
    const indexBeforeConflictStages = fs.readFileSync(indexPath);
    const conflictStages = runHarness([
      "const { spawnSync } = require('node:child_process');",
      "const environment = { ...process.env };",
      "delete environment.GIT_OPTIONAL_LOCKS;",
      `const updated = spawnSync('git', ['update-index', '--index-info'], { env: environment, input: ${JSON.stringify(conflictIndexInfo)}, shell: false });`,
      "if (updated.status !== 0) process.exit(99);",
    ].join('\n'));
    assert.equal(conflictStages.status, 1, 'multi-stage conflict entries fail closed');
    assert.match(conflictStages.stderr, /index semantic identity changed/);
    assert.notDeepEqual(
      fs.readFileSync(indexPath),
      indexBeforeConflictStages,
      'harness detects but does not overwrite multi-stage conflict entries',
    );
    assert.equal(
      runGit(repository, ['ls-files', '--unmerged', '--', 'conflict.txt'])
        .trim().split('\n').length,
      3,
      'all three duplicate-path conflict stages remain present',
    );
    fs.writeFileSync(indexPath, indexBeforeConflictStages);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const indexBeforeResolveUndo = fs.readFileSync(indexPath);
    const resolveUndoMutation = runHarness([
      "const { spawnSync } = require('node:child_process');",
      "const environment = { ...process.env };",
      "delete environment.GIT_OPTIONAL_LOCKS;",
      `const conflicted = spawnSync('git', ['update-index', '--index-info'], { env: environment, input: ${JSON.stringify(conflictIndexInfo)}, shell: false });`,
      "if (conflicted.status !== 0) process.exit(100);",
      "const resolved = spawnSync('git', ['add', '--', 'conflict.txt'], { env: environment, shell: false });",
      "if (resolved.status !== 0) process.exit(101);",
    ].join('\n'));
    assert.equal(resolveUndoMutation.status, 1, 'resolve-undo mutation fails closed');
    assert.match(resolveUndoMutation.stderr, /index semantic identity changed/);
    assert.notDeepEqual(
      fs.readFileSync(indexPath),
      indexBeforeResolveUndo,
      'harness detects but does not overwrite resolve-undo metadata',
    );
    assert.notEqual(
      runGit(repository, ['ls-files', '--resolve-undo', '--', 'conflict.txt']).length,
      0,
      'resolve-undo metadata remains present after the rejected mutation',
    );
    fs.writeFileSync(indexPath, indexBeforeResolveUndo);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const assumeUnchangedMutationSource = [
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const environment = { ...process.env };",
      "delete environment.GIT_OPTIONAL_LOCKS;",
      "const marked = spawnSync('git', ['update-index', '--assume-unchanged', '--', 'stat-cache-clean.txt'], { env: environment, shell: false });",
      "if (marked.status !== 0) process.exit(93);",
      "fs.writeFileSync('stat-cache-clean.txt', 'assume-unchanged hid this mutation\\n');",
    ].join('\n');
    const indexBeforeAssumeUnchanged = fs.readFileSync(indexPath);
    const assumeUnchangedMutation = runHarness(assumeUnchangedMutationSource);
    assert.equal(
      assumeUnchangedMutation.status,
      1,
      'assume-unchanged index intent cannot hide a tracked worktree mutation',
    );
    assert.match(assumeUnchangedMutation.stderr, /index semantic identity changed/);
    assert.equal(
      fs.readFileSync(path.join(repository, 'stat-cache-clean.txt'), 'utf8'),
      'assume-unchanged hid this mutation\n',
      'harness detects but does not overwrite the hidden worktree mutation',
    );
    assert.notDeepEqual(
      fs.readFileSync(indexPath),
      indexBeforeAssumeUnchanged,
      'harness does not overwrite the assume-unchanged index mutation',
    );
    assert.match(
      runGit(repository, ['ls-files', '-v', '--', 'stat-cache-clean.txt']),
      /^[a-z] /,
      'assume-unchanged remains set until explicit fixture cleanup',
    );
    runGit(repository, ['update-index', '--no-assume-unchanged', '--', 'stat-cache-clean.txt']);
    write(repository, 'stat-cache-clean.txt', 'committed stat-cache baseline\n');

    const skipWorktreeMutationSource = [
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const environment = { ...process.env };",
      "delete environment.GIT_OPTIONAL_LOCKS;",
      "const marked = spawnSync('git', ['update-index', '--skip-worktree', '--', 'stat-cache-clean.txt'], { env: environment, shell: false });",
      "if (marked.status !== 0) process.exit(94);",
      "fs.writeFileSync('stat-cache-clean.txt', 'skip-worktree hid this mutation\\n');",
    ].join('\n');
    const indexBeforeSkipWorktree = fs.readFileSync(indexPath);
    const skipWorktreeMutation = runHarness(skipWorktreeMutationSource);
    assert.equal(
      skipWorktreeMutation.status,
      1,
      'skip-worktree index intent cannot hide a tracked worktree mutation',
    );
    assert.match(skipWorktreeMutation.stderr, /index semantic identity changed/);
    assert.equal(
      fs.readFileSync(path.join(repository, 'stat-cache-clean.txt'), 'utf8'),
      'skip-worktree hid this mutation\n',
      'harness detects but does not overwrite the skip-worktree mutation',
    );
    assert.notDeepEqual(
      fs.readFileSync(indexPath),
      indexBeforeSkipWorktree,
      'harness does not overwrite the skip-worktree index mutation',
    );
    assert.match(
      runGit(repository, ['ls-files', '-v', '--', 'stat-cache-clean.txt']),
      /^S /,
      'skip-worktree remains set until explicit fixture cleanup',
    );
    runGit(repository, ['update-index', '--no-skip-worktree', '--', 'stat-cache-clean.txt']);
    write(repository, 'stat-cache-clean.txt', 'committed stat-cache baseline\n');

    if (process.platform !== 'win32') {
      const differentIndexMode = indexModeBeforeStatRefresh ^ 0o100;
      const indexModeMutation = runHarness([
        "const { spawnSync } = require('node:child_process');",
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const resolved = spawnSync('git', ['rev-parse', '--git-path', 'index'], { encoding: 'utf8', shell: false });",
        "if (resolved.status !== 0 || !resolved.stdout.trim()) process.exit(95);",
        `fs.chmodSync(path.resolve(resolved.stdout.trim()), ${differentIndexMode});`,
      ].join('\n'));
      assert.equal(indexModeMutation.status, 1, 'raw index mode mutation fails closed');
      assert.match(indexModeMutation.stderr, /raw Git index mode changed/);
      assert.equal(
        fs.lstatSync(indexPath).mode & 0o7777,
        differentIndexMode,
        'harness detects but does not overwrite a changed raw index mode',
      );
      fs.chmodSync(indexPath, indexModeBeforeStatRefresh);
    }

    const missingIndex = runHarness([
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const resolved = spawnSync('git', ['rev-parse', '--git-path', 'index'], { encoding: 'utf8', shell: false });",
      "if (resolved.status !== 0 || !resolved.stdout.trim()) process.exit(96);",
      "fs.unlinkSync(path.resolve(resolved.stdout.trim()));",
    ].join('\n'));
    assert.equal(missingIndex.status, 1, 'missing raw index fails closed');
    assert.match(missingIndex.stderr, /raw Git index is missing|workspace preservation check failed/);
    assert.equal(fs.existsSync(indexPath), false, 'harness does not recreate a removed raw index');
    fs.writeFileSync(indexPath, indexBytesBeforeStatRefresh);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const directoryIndex = runHarness([
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const resolved = spawnSync('git', ['rev-parse', '--git-path', 'index'], { encoding: 'utf8', shell: false });",
      "if (resolved.status !== 0 || !resolved.stdout.trim()) process.exit(97);",
      "const indexPath = path.resolve(resolved.stdout.trim());",
      "fs.unlinkSync(indexPath);",
      "fs.mkdirSync(indexPath);",
    ].join('\n'));
    assert.equal(directoryIndex.status, 1, 'non-file raw index fails closed');
    assert.match(directoryIndex.stderr, /raw Git index is not a regular file|workspace preservation check failed/);
    assert.equal(fs.lstatSync(indexPath).isDirectory(), true, 'harness does not overwrite a non-file index');
    fs.rmSync(indexPath, { recursive: true, force: true });
    fs.writeFileSync(indexPath, indexBytesBeforeStatRefresh);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const linkedWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-phase60-linked-'));
    fs.rmSync(linkedWorktree, { recursive: true, force: true });
    runGit(repository, ['worktree', 'add', '--detach', linkedWorktree, 'HEAD']);
    try {
      assert.equal(
        fs.lstatSync(path.join(linkedWorktree, '.git')).isFile(),
        true,
        'linked fixture uses a .git file rather than a repository-local index directory',
      );
      const linkedIndexPath = resolveGitIndex(linkedWorktree);
      assert.equal(
        path.relative(linkedWorktree, linkedIndexPath).startsWith('..'),
        true,
        'linked fixture resolves its index from the worktree administration directory',
      );
      const linkedIndexBefore = fs.readFileSync(linkedIndexPath);
      const linkedIndexModeBefore = fs.lstatSync(linkedIndexPath).mode & 0o7777;
      const linkedRefresh = runHarness(statRefreshSource, { repositoryRoot: linkedWorktree });
      assert.equal(
        linkedRefresh.status,
        0,
        `linked-worktree stat-cache refresh is restored: ${linkedRefresh.stderr}`,
      );
      assert.deepEqual(
        fs.readFileSync(linkedIndexPath),
        linkedIndexBefore,
        'linked-worktree raw index bytes are restored at the resolved administration path',
      );
      assert.equal(
        fs.lstatSync(linkedIndexPath).mode & 0o7777,
        linkedIndexModeBefore,
        'linked-worktree raw index mode is preserved',
      );
    } finally {
      runGit(repository, ['worktree', 'remove', '--force', linkedWorktree]);
      fs.rmSync(linkedWorktree, { recursive: true, force: true });
    }

    const unexpectedSource = [
      restoredDirtySource,
      "fs.writeFileSync('clean.txt', 'child changed a previously clean tracked path\\n');",
      "fs.writeFileSync('unexpected.txt', 'child added an untracked path\\n');",
    ].join('\n');
    const unexpected = runHarness(unexpectedSource);
    assert.equal(unexpected.status, 1,
      'new clean-tracked and untracked mutations still make the harness fail closed');
    assert.doesNotMatch(unexpected.stderr, /index semantic identity changed/);
    assert.match(unexpected.stderr, /pre-existing tracked dirty bytes changed/);
    assert.match(unexpected.stderr, /untracked workspace entries changed/);
    assert.match(unexpected.stderr, /workspace path\/status set changed/);
    assert.equal(fs.readFileSync(path.join(repository, 'dirty.txt'), 'utf8'), 'user dirty bytes\n');
    assert.equal(runGit(repository, ['show', ':staged.txt']), 'user staged bytes\n');
    assert.equal(
      fs.readFileSync(path.join(repository, 'showcase/angular/public/llms.txt'), 'utf8'),
      '<!-- generated 2026-07-14 by build-crawler-files.mjs -->\n',
    );
    assert.equal(
      fs.readFileSync(path.join(repository, 'clean.txt'), 'utf8'),
      'child changed a previously clean tracked path\n',
      'harness leaves newly-mutated clean tracked paths untouched',
    );
    assert.equal(
      fs.readFileSync(path.join(repository, 'unexpected.txt'), 'utf8'),
      'child added an untracked path\n',
      'harness leaves newly-created untracked paths untouched',
    );

    write(repository, 'clean.txt', 'committed clean baseline\n');
    fs.unlinkSync(path.join(repository, 'unexpected.txt'));

    const stagedMutationSource = [
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "fs.writeFileSync('dirty.txt', 'child overwrote dirty bytes\\n');",
      "fs.writeFileSync('staged.txt', 'child replaced staged bytes\\n');",
      "fs.writeFileSync('showcase/angular/public/llms.txt', '<!-- generated 2026-07-15 by build-crawler-files.mjs -->\\n');",
      "const added = spawnSync('git', ['add', '--', 'staged.txt'], { shell: false });",
      "if (added.status !== 0) process.exit(91);",
    ].join('\n');
    const stagedMutation = runHarness(stagedMutationSource);
    assert.equal(stagedMutation.status, 1,
      'staged index mutations still make the harness fail closed');
    assert.match(stagedMutation.stderr, /index semantic identity changed/);
    assert.match(stagedMutation.stderr, /pre-existing tracked dirty bytes changed/);
    assert.doesNotMatch(stagedMutation.stderr, /untracked workspace entries changed/);
    assert.equal(
      runGit(repository, ['show', ':staged.txt']),
      'child replaced staged bytes\n',
      'harness detects but does not overwrite changed staged index bytes',
    );
    assert.equal(
      fs.readFileSync(path.join(repository, 'staged.txt'), 'utf8'),
      'child replaced staged bytes\n',
      'harness does not restore a staged-only path from HEAD or the index',
    );
    assert.equal(fs.readFileSync(path.join(repository, 'dirty.txt'), 'utf8'), 'user dirty bytes\n');
    assert.equal(
      fs.readFileSync(path.join(repository, 'showcase/angular/public/llms.txt'), 'utf8'),
      '<!-- generated 2026-07-14 by build-crawler-files.mjs -->\n',
    );
    console.log('phase60-full-tests-harness.test.js: PASS');
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
}

main();
