'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const harnessPath = path.join(repoRoot, 'scripts', 'run-phase60-full-tests.mjs');

function runGit(repository, args) {
  const environment = { ...process.env };
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

function write(repository, relativePath, value) {
  const target = path.join(repository, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
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

    function runHarness(childSource) {
      const environment = {
        ...process.env,
        FSB_PHASE60_INJECT_FAILURE: '',
        FSB_PHASE60_TEST_REPOSITORY_ROOT: repository,
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
    assert.doesNotMatch(restored.stderr, /staged index bytes changed/);
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

    const indexPath = path.join(repository, '.git/index');
    const indexBytesBeforeStatRefresh = fs.readFileSync(indexPath);
    const indexModeBeforeStatRefresh = fs.lstatSync(indexPath).mode & 0o7777;
    const statRefreshSource = [
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const target = 'stat-cache-clean.txt';",
      "const before = fs.statSync(target);",
      "fs.utimesSync(target, before.atime, new Date(before.mtimeMs + 2000));",
      "const refreshed = spawnSync('git', ['status', '--short', '--', target], { shell: false });",
      "if (refreshed.status !== 0) process.exit(92);",
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

    const differentIndexMode = indexModeBeforeStatRefresh ^ 0o100;
    const indexModeMutation = runHarness([
      "const fs = require('node:fs');",
      `fs.chmodSync('.git/index', ${differentIndexMode});`,
    ].join('\n'));
    assert.equal(indexModeMutation.status, 1, 'raw index mode mutation fails closed');
    assert.match(indexModeMutation.stderr, /raw Git index mode changed/);
    assert.equal(
      fs.lstatSync(indexPath).mode & 0o7777,
      differentIndexMode,
      'harness detects but does not overwrite a changed raw index mode',
    );
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const missingIndex = runHarness("require('node:fs').unlinkSync('.git/index');");
    assert.equal(missingIndex.status, 1, 'missing raw index fails closed');
    assert.match(missingIndex.stderr, /raw Git index is missing|workspace preservation check failed/);
    assert.equal(fs.existsSync(indexPath), false, 'harness does not recreate a removed raw index');
    fs.writeFileSync(indexPath, indexBytesBeforeStatRefresh);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const directoryIndex = runHarness([
      "const fs = require('node:fs');",
      "fs.unlinkSync('.git/index');",
      "fs.mkdirSync('.git/index');",
    ].join('\n'));
    assert.equal(directoryIndex.status, 1, 'non-file raw index fails closed');
    assert.match(directoryIndex.stderr, /raw Git index is not a regular file|workspace preservation check failed/);
    assert.equal(fs.lstatSync(indexPath).isDirectory(), true, 'harness does not overwrite a non-file index');
    fs.rmSync(indexPath, { recursive: true, force: true });
    fs.writeFileSync(indexPath, indexBytesBeforeStatRefresh);
    fs.chmodSync(indexPath, indexModeBeforeStatRefresh);

    const unexpectedSource = [
      restoredDirtySource,
      "fs.writeFileSync('clean.txt', 'child changed a previously clean tracked path\\n');",
      "fs.writeFileSync('unexpected.txt', 'child added an untracked path\\n');",
    ].join('\n');
    const unexpected = runHarness(unexpectedSource);
    assert.equal(unexpected.status, 1,
      'new clean-tracked and untracked mutations still make the harness fail closed');
    assert.doesNotMatch(unexpected.stderr, /staged index bytes changed/);
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
    assert.match(stagedMutation.stderr, /staged index bytes changed/);
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
