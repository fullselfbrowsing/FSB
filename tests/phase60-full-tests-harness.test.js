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
    write(repository, 'dirty.txt', 'committed dirty baseline\n');
    write(repository, 'staged.txt', 'committed staged baseline\n');
    runGit(repository, ['add', '--all']);
    runGit(repository, ['commit', '--quiet', '-m', 'fixture baseline']);

    write(repository, 'dirty.txt', 'user dirty bytes\n');
    write(repository, 'staged.txt', 'user staged bytes\n');
    runGit(repository, ['add', '--', 'staged.txt']);

    const childSource = [
      "const { spawnSync } = require('node:child_process');",
      "const fs = require('node:fs');",
      "fs.writeFileSync('dirty.txt', 'child overwrote dirty bytes\\n');",
      "fs.writeFileSync('staged.txt', 'child replaced staged bytes\\n');",
      "fs.writeFileSync('unexpected.txt', 'child added an untracked path\\n');",
      "const added = spawnSync('git', ['add', '--', 'staged.txt'], { shell: false });",
      "if (added.status !== 0) process.exit(91);",
    ].join('\n');
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
    const result = spawnSync(process.execPath, [harnessPath], {
      cwd: repoRoot,
      env: environment,
      encoding: 'utf8',
      shell: false,
    });

    assert.equal(result.status, 1, 'workspace byte mutation makes the harness fail closed');
    assert.match(result.stderr, /staged index bytes changed/);
    assert.match(result.stderr, /pre-existing tracked dirty bytes changed/);
    assert.match(result.stderr, /untracked workspace entries changed/);
    assert.match(result.stderr, /workspace path\/status set changed/);
    assert.equal(fs.existsSync(compatibilityPath), false, 'harness removes only its compatibility symlink');
    assert.equal(fs.existsSync(compatibilityDirectory), false, 'harness removes its newly-created compatibility directory');
    assert.equal(
      fs.readFileSync(path.join(repository, 'dirty.txt'), 'utf8'),
      'child overwrote dirty bytes\n',
      'harness detects but does not restore overwritten dirty bytes',
    );
    assert.equal(
      runGit(repository, ['show', ':staged.txt']),
      'child replaced staged bytes\n',
      'harness detects but does not restore changed staged bytes',
    );
    assert.equal(
      fs.readFileSync(path.join(repository, 'unexpected.txt'), 'utf8'),
      'child added an untracked path\n',
      'harness leaves child-created paths untouched',
    );
    console.log('phase60-full-tests-harness.test.js: PASS');
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
}

main();
