'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repositoryRoot, 'scripts', 'sync-product-version.mjs');

const extensionExclusiveTargets = [
  'extension/manifest.json',
  'package.json',
  'package-lock.json',
  'showcase/angular/package.json',
  'showcase/angular/package-lock.json',
  'showcase/angular/src/app/core/seo/version.ts',
  'showcase/server/package.json',
  'showcase/server/package-lock.json',
  'skills/fsb/SKILL.md',
  'extension/README.md',
  'showcase/about.html',
  'skills/fsb/references/multi-agent-contract.md',
  'store-assets/chrome-web-store/listing-copy.md',
];

const mcpExclusiveTargets = [
  'mcp/package.json',
  'mcp/package-lock.json',
  'mcp/server.json',
  'mcp/build/version.d.ts',
  'mcp/build/version.js',
  'mcp/src/version.ts',
  'mcp/native-host/runtime-integrity.json',
  'mcp/CHANGELOG.md',
];

function run(args, root = repositoryRoot) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FSB_VERSION_SYNC_ROOT: root },
  });
}

function sha256(pathname) {
  return crypto.createHash('sha256').update(fs.readFileSync(pathname)).digest('hex');
}

function targetDigests(root, targets) {
  return Object.fromEntries(targets.map((target) => [target, sha256(path.join(root, target))]));
}

function copyTarget(root, relativePath) {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, relativePath), destination);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function writeJson(root, relativePath, value) {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function prepareExtensionChangelog(root, version) {
  const pathname = path.join(root, 'CHANGELOG.md');
  const source = fs.readFileSync(pathname, 'utf8');
  fs.writeFileSync(
    pathname,
    source.replace(
      /The extension version is `\d+\.\d+\.\d+`/u,
      `The extension version is \`${version}\``,
    ).replace(
      /^## v\d+\.\d+\.\d+\b/mu,
      `## v${version} — Fixture Extension Release — 2026-08-11\n\nFixture extension release notes.\n\n$&`,
    ),
  );
}

function prepareMcpChangelog(root, version) {
  const pathname = path.join(root, 'mcp/CHANGELOG.md');
  const source = fs.readFileSync(pathname, 'utf8');
  fs.writeFileSync(
    pathname,
    source.replace(
      /^<a id="v\d+\.\d+\.\d+"><\/a>$/mu,
      `<a id="v${version}"></a>\n\n## ${version} (2026-08-11)\n\nFixture MCP release notes for \`fsb-mcp-server@${version}\`.\n\n$&`,
    ),
  );
}

function lockWithoutReleaseVersion(lock) {
  const copy = structuredClone(lock);
  delete copy.version;
  if (copy.packages?.['']) delete copy.packages[''].version;
  return copy;
}

function main() {
  const liveCheck = run(['--check']);
  assert.equal(liveCheck.status, 0, liveCheck.stderr || liveCheck.stdout);
  assert.match(liveCheck.stdout, /extension 0\.9\.91; MCP 0\.11\.0/u);

  const targetResult = run(['--print-targets']);
  assert.equal(targetResult.status, 0, targetResult.stderr);
  const targets = JSON.parse(targetResult.stdout);
  assert(Array.isArray(targets) && targets.length > 20, 'version target inventory is populated');
  assert(targets.includes('mcp/build/version.js'), 'compiled MCP runtime is managed');
  assert(targets.includes('.github/workflows/chrome-extension.yml'), 'extension workflow is managed');
  assert(targets.includes('.github/workflows/npm-publish.yml'), 'MCP workflow is managed');

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-version-sync-'));
  try {
    for (const target of targets) copyTarget(fixtureRoot, target);

    const originalDigests = targetDigests(fixtureRoot, targets);
    for (const [domain, invalid] of [
      ['extension', '1.2'],
      ['extension', '1.2.3-beta.1'],
      ['extension', '01.2.3'],
      ['extension', '65536.0.0'],
      ['mcp', '1.2'],
      ['mcp', '1.2.3-beta.1'],
    ]) {
      const result = run([domain, invalid], fixtureRoot);
      assert.notEqual(result.status, 0, `${domain} ${invalid} unexpectedly passed validation`);
      assert.match(result.stderr, /version-sync:/u);
      assert.deepEqual(
        targetDigests(fixtureRoot, targets),
        originalDigests,
        `${domain} ${invalid} changed a release target`,
      );
    }

    const beforeUnpreparedExtension = targetDigests(fixtureRoot, targets);
    const unpreparedExtension = run(['extension', '0.9.92'], fixtureRoot);
    assert.notEqual(unpreparedExtension.status, 0, 'extension setter accepted a missing changelog entry');
    assert.match(unpreparedExtension.stderr, /author the 0\.9\.92 entry at the top of CHANGELOG\.md/u);
    assert.doesNotMatch(unpreparedExtension.stderr, /mcp\/CHANGELOG\.md/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, targets),
      beforeUnpreparedExtension,
      'unprepared extension release changed a target',
    );

    prepareExtensionChangelog(fixtureRoot, '0.9.92');
    const readmePath = path.join(fixtureRoot, 'README.md');
    const validReadme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      validReadme.replace(/^# FSB v\d+\.\d+\.\d+ Full Self Browsing$/mu, '# FSB Full Self Browsing'),
    );
    const beforeMalformedExtension = targetDigests(fixtureRoot, targets);
    const malformedExtension = run(['extension', '0.9.92'], fixtureRoot);
    assert.notEqual(malformedExtension.status, 0, 'extension setter accepted a malformed surface');
    assert.match(malformedExtension.stderr, /README\.md: expected exactly one current README title/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, targets),
      beforeMalformedExtension,
      'failed extension preflight left partial writes',
    );
    fs.writeFileSync(readmePath, validReadme);

    const mcpBeforeExtensionSet = targetDigests(fixtureRoot, mcpExclusiveTargets);
    const extensionLocks = [
      'package-lock.json',
      'showcase/angular/package-lock.json',
      'showcase/server/package-lock.json',
    ];
    const preservedExtensionLocks = Object.fromEntries(extensionLocks.map((relativePath) => [
      relativePath,
      lockWithoutReleaseVersion(readJson(fixtureRoot, relativePath)),
    ]));
    const extensionSet = run(['extension', '0.9.92'], fixtureRoot);
    assert.equal(extensionSet.status, 0, extensionSet.stderr || extensionSet.stdout);
    assert.match(extensionSet.stdout, /version-set:extension: updated 0\.9\.92/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, mcpExclusiveTargets),
      mcpBeforeExtensionSet,
      'extension setter changed MCP-owned files',
    );
    assert.equal(readJson(fixtureRoot, 'extension/manifest.json').version, '0.9.92');
    assert.equal(readJson(fixtureRoot, 'extension/manifest.json').name, 'FSB v0.9.92');
    for (const [packagePath, lockPath] of [
      ['package.json', 'package-lock.json'],
      ['showcase/angular/package.json', 'showcase/angular/package-lock.json'],
      ['showcase/server/package.json', 'showcase/server/package-lock.json'],
    ]) {
      assert.equal(readJson(fixtureRoot, packagePath).version, '0.9.92', packagePath);
      const lock = readJson(fixtureRoot, lockPath);
      assert.equal(lock.version, '0.9.92', `${lockPath} top-level version`);
      assert.equal(lock.packages[''].version, '0.9.92', `${lockPath} root version`);
      assert.deepEqual(
        lockWithoutReleaseVersion(lock),
        preservedExtensionLocks[lockPath],
        `${lockPath} dependencies changed`,
      );
    }
    const mixedCheck = run(['--check'], fixtureRoot);
    assert.equal(mixedCheck.status, 0, mixedCheck.stderr || mixedCheck.stdout);
    assert.match(mixedCheck.stdout, /extension 0\.9\.92; MCP 0\.11\.0/u);

    const beforeUnpreparedMcp = targetDigests(fixtureRoot, targets);
    const unpreparedMcp = run(['mcp', '0.11.1'], fixtureRoot);
    assert.notEqual(unpreparedMcp.status, 0, 'MCP setter accepted a missing changelog entry');
    assert.match(unpreparedMcp.stderr, /author the 0\.11\.1 entry at the top of mcp\/CHANGELOG\.md/u);
    assert.doesNotMatch(unpreparedMcp.stderr, /top of CHANGELOG\.md/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, targets),
      beforeUnpreparedMcp,
      'unprepared MCP release changed a target',
    );

    prepareMcpChangelog(fixtureRoot, '0.11.1');
    const preparedMcpChangelog = fs.readFileSync(path.join(fixtureRoot, 'mcp/CHANGELOG.md'), 'utf8');
    const extensionBeforeMcpSet = targetDigests(fixtureRoot, extensionExclusiveTargets);
    const preservedMcpLock = lockWithoutReleaseVersion(readJson(fixtureRoot, 'mcp/package-lock.json'));
    const mcpSet = run(['mcp', '0.11.1'], fixtureRoot);
    assert.equal(mcpSet.status, 0, mcpSet.stderr || mcpSet.stdout);
    assert.match(mcpSet.stdout, /version-set:mcp: updated 0\.11\.1/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, extensionExclusiveTargets),
      extensionBeforeMcpSet,
      'MCP setter changed extension-owned files',
    );
    assert.equal(
      fs.readFileSync(path.join(fixtureRoot, 'mcp/CHANGELOG.md'), 'utf8'),
      preparedMcpChangelog,
      'MCP setter rewrote changelog history',
    );

    const mcpPackage = readJson(fixtureRoot, 'mcp/package.json');
    const mcpLock = readJson(fixtureRoot, 'mcp/package-lock.json');
    const server = readJson(fixtureRoot, 'mcp/server.json');
    const integrity = readJson(fixtureRoot, 'mcp/native-host/runtime-integrity.json');
    assert.equal(mcpPackage.version, '0.11.1');
    assert.equal(mcpLock.version, '0.11.1');
    assert.equal(mcpLock.packages[''].version, '0.11.1');
    assert.deepEqual(lockWithoutReleaseVersion(mcpLock), preservedMcpLock, 'MCP dependencies changed');
    assert.equal(server.version, '0.11.1');
    assert.equal(server.packages[0].version, '0.11.1');
    assert.equal(integrity.packageVersion, '0.11.1');
    assert.equal(integrity.lockSha256, sha256(path.join(fixtureRoot, 'mcp/package-lock.json')));
    assert.match(
      fs.readFileSync(path.join(fixtureRoot, 'mcp/build/version.js'), 'utf8'),
      /FSB_MCP_VERSION = '0\.11\.1'/u,
    );
    assert.match(
      fs.readFileSync(path.join(fixtureRoot, 'mcp/build/version.d.ts'), 'utf8'),
      /FSB_MCP_VERSION = "0\.11\.1"/u,
    );

    const independentCheck = run(['--check'], fixtureRoot);
    assert.equal(independentCheck.status, 0, independentCheck.stderr || independentCheck.stdout);
    assert.match(independentCheck.stdout, /extension 0\.9\.92; MCP 0\.11\.1/u);

    const firstSetDigests = targetDigests(fixtureRoot, targets);
    const secondExtensionSet = run(['extension', '0.9.92'], fixtureRoot);
    const secondMcpSet = run(['mcp', '0.11.1'], fixtureRoot);
    assert.equal(secondExtensionSet.status, 0, secondExtensionSet.stderr || secondExtensionSet.stdout);
    assert.equal(secondMcpSet.status, 0, secondMcpSet.stderr || secondMcpSet.stdout);
    assert.match(secondExtensionSet.stdout, /already synchronized at 0\.9\.92/u);
    assert.match(secondMcpSet.stdout, /already synchronized at 0\.11\.1/u);
    assert.deepEqual(targetDigests(fixtureRoot, targets), firstSetDigests, 'idempotent setters changed output');

    const synchronizedReadme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      synchronizedReadme.replace('> FSB v0.9.92 is functional', '> FSB v9.9.9 is functional'),
    );
    const extensionDrift = run(['--check'], fixtureRoot);
    assert.notEqual(extensionDrift.status, 0, 'check accepted extension public-surface drift');
    assert.match(extensionDrift.stderr, /README\.md: differs from the independent version setters/u);
    fs.writeFileSync(readmePath, synchronizedReadme);

    const serverPath = path.join(fixtureRoot, 'mcp/server.json');
    const synchronizedServer = readJson(fixtureRoot, 'mcp/server.json');
    writeJson(fixtureRoot, 'mcp/server.json', { ...synchronizedServer, version: '9.9.9' });
    const mcpDrift = run(['--check'], fixtureRoot);
    assert.notEqual(mcpDrift.status, 0, 'check accepted MCP metadata drift');
    assert.match(mcpDrift.stderr, /MCP server metadata version: expected 0\.11\.1, got 9\.9\.9/u);
    fs.writeFileSync(serverPath, `${JSON.stringify(synchronizedServer, null, 2)}\n`);

    const installSourcePath = path.join(fixtureRoot, 'mcp/src/install.ts');
    const synchronizedInstall = fs.readFileSync(installSourcePath, 'utf8');
    fs.writeFileSync(
      installSourcePath,
      synchronizedInstall.replace('Arguments: -y fsb-mcp-server@latest', 'Arguments: -y fsb-mcp-server'),
    );
    const pinDrift = run(['--check'], fixtureRoot);
    assert.notEqual(pinDrift.status, 0, 'check accepted an unpinned MCP command');
    assert.match(pinDrift.stderr, /mcp\/src\/install\.ts: contains an unpinned npx MCP command/u);
    fs.writeFileSync(installSourcePath, synchronizedInstall);

    const mcpReadmePath = path.join(fixtureRoot, 'mcp/README.md');
    const synchronizedMcpReadme = fs.readFileSync(mcpReadmePath, 'utf8');
    fs.writeFileSync(
      mcpReadmePath,
      synchronizedMcpReadme.replace("### What's New In v0.7.4", "### What's New In v0.11.1"),
    );
    const duplicateHeading = run(['--check'], fixtureRoot);
    assert.notEqual(duplicateHeading.status, 0, 'check accepted duplicate MCP release headings');
    assert.match(duplicateHeading.stderr, /MCP README contains duplicate What's New release headings/u);
    fs.writeFileSync(mcpReadmePath, synchronizedMcpReadme);

    if (process.platform !== 'win32') {
      prepareExtensionChangelog(fixtureRoot, '0.9.93');
      const beforeCommitFailure = targetDigests(fixtureRoot, targets);
      const rootLockPath = path.join(fixtureRoot, 'package-lock.json');
      fs.chmodSync(rootLockPath, 0o444);
      const commitFailure = run(['extension', '0.9.93'], fixtureRoot);
      fs.chmodSync(rootLockPath, 0o644);
      assert.notEqual(commitFailure.status, 0, 'read-only target did not fail the commit');
      assert.match(commitFailure.stderr, /could not commit version updates/u);
      assert.deepEqual(
        targetDigests(fixtureRoot, targets),
        beforeCommitFailure,
        'commit failure did not roll back prior writes',
      );
    }

    const mcpWorkflow = fs.readFileSync(path.join(fixtureRoot, '.github/workflows/npm-publish.yml'), 'utf8');
    const extensionWorkflow = fs.readFileSync(path.join(fixtureRoot, '.github/workflows/chrome-extension.yml'), 'utf8');
    assert.match(mcpWorkflow, /- 'mcp-v\*'/u);
    assert.doesNotMatch(mcpWorkflow, /- 'extension-v\*'/u);
    assert.doesNotMatch(mcpWorkflow, /^\s+- 'v\*'$/mu);
    assert.match(extensionWorkflow, /- 'extension-v\*'/u);
    assert.doesNotMatch(extensionWorkflow, /- 'mcp-v\*'/u);
    assert.match(extensionWorkflow, /fsb-extension-v\$\{\{ steps\.extension-version\.outputs\.version \}\}\.zip/u);
    assert.match(mcpWorkflow, /fsb-mcp-server-\$\{packageManifest\.version\}-release-metadata\.json/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log('version-sync: PASS');
}

main();
