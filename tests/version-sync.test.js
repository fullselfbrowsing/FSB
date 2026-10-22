'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repositoryRoot, 'scripts', 'sync-product-version.mjs');
const compatPath = path.join(repositoryRoot, 'scripts', 'lib', 'mcp-extension-compat.mjs');

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

function nextPatch(version) {
  const parts = version.split('.').map(Number);
  parts[2] += 1;
  return parts.join('.');
}

function assertIncludes(actual, expected) {
  assert(actual.includes(expected), `Expected ${JSON.stringify(expected)} in:\n${actual}`);
}

function assertExcludes(actual, unexpected, message) {
  assert(!actual.includes(unexpected), `${message}: found ${JSON.stringify(unexpected)}`);
}

// D-22: each MCP release states its own declared minimum extension version.
function assertCompatDeclarations(compat) {
  const { MCP_EXTENSION_COMPAT, compatFor, compatBullet, compatPairLine } = compat;
  assert(Object.isFrozen(MCP_EXTENSION_COMPAT), 'the compatibility map is frozen');
  assert.equal(compatFor('0.11.2').minimum, '0.9.92');
  assert.equal(compatFor('0.11.2').feature, null);
  assert.equal(compatFor('0.11.3'), MCP_EXTENSION_COMPAT['0.11.2'], '0.11.3 inherits the 0.11.2 entry');
  assert.equal(compatFor('0.12.0').minimum, '0.9.92');
  assert.deepEqual(compatFor('0.12.0').feature, { version: '1.0.0', names: ['settings', 'expect'] });
  assert.equal(compatFor('0.12.4'), MCP_EXTENSION_COMPAT['0.12.0'], '0.12.4 inherits the 0.12.0 entry');
  // IN-07: inheritance runs forward only; an earlier patch never takes a later patch's reasons.
  assert.throws(() => compatFor('0.11.0'), /no declared extension compatibility for MCP 0\.11\.0;/u);
  assert.throws(() => compatFor('0.11.1'), /no declared extension compatibility for MCP 0\.11\.1;/u);
  assert.throws(
    () => compatFor('0.13.0'),
    /^Error: no declared extension compatibility for MCP 0\.13\.0; add it to scripts\/lib\/mcp-extension-compat\.mjs$/u,
  );
  assert.throws(() => compatFor('0.12'), /no declared extension compatibility for MCP 0\.12;/u);

  // Today's mcp/README.md sentences at 0.11.2 are reproduced byte for byte.
  assert.equal(
    compatBullet('0.11.2'),
    '- **Compatibility:** `fsb-mcp-server` 0.11.2 requires FSB extension 0.9.92 or newer for `mcp:task-status`. Upgrade the extension and restart the MCP host together.',
  );
  assert.equal(
    compatPairLine('0.11.2'),
    'Compatibility for this release: MCP 0.11.2 requires extension 0.9.92 or newer for the `mcp:task-status` route used by `complete_task`, `partial_task`, and `fail_task`. Existing `0.10.0` tool routes remain additive and unchanged.',
  );
  // 0.12.0: existing tools keep 0.9.92; settings and expect need 1.0.0 (66.1-03, 69-06).
  assert.equal(
    compatBullet('0.12.0'),
    '- **Compatibility:** `fsb-mcp-server` 0.12.0 requires FSB extension 0.9.92 or newer for existing tools; `settings` and the optional `expect` need FSB extension 1.0.0 or newer. Upgrade the extension and restart the MCP host together.',
  );
  assert.equal(
    compatPairLine('0.12.0'),
    'Compatibility for this release: MCP 0.12.0 requires extension 0.9.92 or newer for existing tools. `settings` and the optional `expect` need extension 1.0.0 or newer; older extensions answer `SETTING_UNSUPPORTED` and report `expect_result` as `uncertain` with `extension_unsupported`. Existing tool routes remain additive and unchanged.',
  );
}

async function main() {
  const compat = await import(pathToFileURL(compatPath).href);
  assertCompatDeclarations(compat);
  const { compatFor, compatBullet, compatPairLine } = compat;

  const currentExtensionVersion = readJson(repositoryRoot, 'extension/manifest.json').version;
  const currentMcpVersion = readJson(repositoryRoot, 'mcp/package.json').version;
  const nextExtensionVersion = nextPatch(currentExtensionVersion);
  const nextMcpVersion = nextPatch(currentMcpVersion);
  const rollbackExtensionVersion = nextPatch(nextExtensionVersion);
  const liveCheck = run(['--check']);
  assert.equal(liveCheck.status, 0, liveCheck.stderr || liveCheck.stdout);
  assertIncludes(liveCheck.stdout, `extension ${currentExtensionVersion}; MCP ${currentMcpVersion}`);
  const liveMcpReadme = fs.readFileSync(path.join(repositoryRoot, 'mcp/README.md'), 'utf8');
  assertIncludes(liveMcpReadme, compatBullet(currentMcpVersion));
  assertIncludes(liveMcpReadme, compatPairLine(currentMcpVersion));

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
    const unpreparedExtension = run(['extension', nextExtensionVersion], fixtureRoot);
    assert.notEqual(unpreparedExtension.status, 0, 'extension setter accepted a missing changelog entry');
    assertIncludes(unpreparedExtension.stderr, `author the ${nextExtensionVersion} entry at the top of CHANGELOG.md`);
    assert.doesNotMatch(unpreparedExtension.stderr, /mcp\/CHANGELOG\.md/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, targets),
      beforeUnpreparedExtension,
      'unprepared extension release changed a target',
    );

    prepareExtensionChangelog(fixtureRoot, nextExtensionVersion);
    const readmePath = path.join(fixtureRoot, 'README.md');
    const validReadme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      validReadme.replace(/^# FSB v\d+\.\d+\.\d+ Full Self Browsing$/mu, '# FSB Full Self Browsing'),
    );
    const beforeMalformedExtension = targetDigests(fixtureRoot, targets);
    const malformedExtension = run(['extension', nextExtensionVersion], fixtureRoot);
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
    const extensionSet = run(['extension', nextExtensionVersion], fixtureRoot);
    assert.equal(extensionSet.status, 0, extensionSet.stderr || extensionSet.stdout);
    assertIncludes(extensionSet.stdout, `version-set:extension: updated ${nextExtensionVersion}`);
    assert.deepEqual(
      targetDigests(fixtureRoot, mcpExclusiveTargets),
      mcpBeforeExtensionSet,
      'extension setter changed MCP-owned files',
    );
    assert.equal(readJson(fixtureRoot, 'extension/manifest.json').version, nextExtensionVersion);
    assert.equal(readJson(fixtureRoot, 'extension/manifest.json').name, `FSB v${nextExtensionVersion}`);
    for (const [packagePath, lockPath] of [
      ['package.json', 'package-lock.json'],
      ['showcase/angular/package.json', 'showcase/angular/package-lock.json'],
      ['showcase/server/package.json', 'showcase/server/package-lock.json'],
    ]) {
      assert.equal(readJson(fixtureRoot, packagePath).version, nextExtensionVersion, packagePath);
      const lock = readJson(fixtureRoot, lockPath);
      assert.equal(lock.version, nextExtensionVersion, `${lockPath} top-level version`);
      assert.equal(lock.packages[''].version, nextExtensionVersion, `${lockPath} root version`);
      assert.deepEqual(
        lockWithoutReleaseVersion(lock),
        preservedExtensionLocks[lockPath],
        `${lockPath} dependencies changed`,
      );
    }
    const mixedCheck = run(['--check'], fixtureRoot);
    assert.equal(mixedCheck.status, 0, mixedCheck.stderr || mixedCheck.stdout);
    assertIncludes(mixedCheck.stdout, `extension ${nextExtensionVersion}; MCP ${currentMcpVersion}`);
    // An extension-only release keeps the MCP release's own declared minimum (the step-A trap, D-22).
    const mcpReadmePathAfterExtension = path.join(fixtureRoot, 'mcp/README.md');
    const mcpReadmeAfterExtension = fs.readFileSync(mcpReadmePathAfterExtension, 'utf8');
    assertIncludes(
      mcpReadmeAfterExtension,
      `MCP ${currentMcpVersion} requires extension ${compatFor(currentMcpVersion).minimum} or newer`,
    );
    assertIncludes(mcpReadmeAfterExtension, compatBullet(currentMcpVersion));
    assertExcludes(
      mcpReadmeAfterExtension,
      `requires extension ${nextExtensionVersion}`,
      'extension setter claimed the current MCP release needs the new extension',
    );
    assertExcludes(
      mcpReadmeAfterExtension,
      `requires FSB extension ${nextExtensionVersion}`,
      'extension setter claimed the current MCP release needs the new extension',
    );

    const beforeUnpreparedMcp = targetDigests(fixtureRoot, targets);
    const unpreparedMcp = run(['mcp', nextMcpVersion], fixtureRoot);
    assert.notEqual(unpreparedMcp.status, 0, 'MCP setter accepted a missing changelog entry');
    assertIncludes(unpreparedMcp.stderr, `author the ${nextMcpVersion} entry at the top of mcp/CHANGELOG.md`);
    assert.doesNotMatch(unpreparedMcp.stderr, /top of CHANGELOG\.md/u);
    assert.deepEqual(
      targetDigests(fixtureRoot, targets),
      beforeUnpreparedMcp,
      'unprepared MCP release changed a target',
    );

    prepareMcpChangelog(fixtureRoot, nextMcpVersion);
    const preparedMcpChangelog = fs.readFileSync(path.join(fixtureRoot, 'mcp/CHANGELOG.md'), 'utf8');
    const extensionBeforeMcpSet = targetDigests(fixtureRoot, extensionExclusiveTargets);
    const preservedMcpLock = lockWithoutReleaseVersion(readJson(fixtureRoot, 'mcp/package-lock.json'));
    const mcpSet = run(['mcp', nextMcpVersion], fixtureRoot);
    assert.equal(mcpSet.status, 0, mcpSet.stderr || mcpSet.stdout);
    assertIncludes(mcpSet.stdout, `version-set:mcp: updated ${nextMcpVersion}`);
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
    assert.equal(mcpPackage.version, nextMcpVersion);
    assert.equal(mcpLock.version, nextMcpVersion);
    assert.equal(mcpLock.packages[''].version, nextMcpVersion);
    assert.deepEqual(lockWithoutReleaseVersion(mcpLock), preservedMcpLock, 'MCP dependencies changed');
    assert.equal(server.version, nextMcpVersion);
    assert.equal(server.packages[0].version, nextMcpVersion);
    assert.equal(integrity.packageVersion, nextMcpVersion);
    assert.equal(integrity.lockSha256, sha256(path.join(fixtureRoot, 'mcp/package-lock.json')));
    assertIncludes(
      fs.readFileSync(path.join(fixtureRoot, 'mcp/build/version.js'), 'utf8'),
      `FSB_MCP_VERSION = '${nextMcpVersion}'`,
    );
    assertIncludes(
      fs.readFileSync(path.join(fixtureRoot, 'mcp/build/version.d.ts'), 'utf8'),
      `FSB_MCP_VERSION = "${nextMcpVersion}"`,
    );
    // A patch release inherits its minor's declared minimum, not the current extension version.
    const mcpReadmeAfterMcp = fs.readFileSync(path.join(fixtureRoot, 'mcp/README.md'), 'utf8');
    assertIncludes(
      mcpReadmeAfterMcp,
      `MCP ${nextMcpVersion} requires extension ${compatFor(nextMcpVersion).minimum} or newer`,
    );
    assertIncludes(mcpReadmeAfterMcp, compatPairLine(nextMcpVersion));
    assertIncludes(mcpReadmeAfterMcp, compatBullet(nextMcpVersion));
    assertExcludes(
      mcpReadmeAfterMcp,
      `requires extension ${nextExtensionVersion}`,
      'MCP setter copied the current extension version into the compatibility pair',
    );

    const independentCheck = run(['--check'], fixtureRoot);
    assert.equal(independentCheck.status, 0, independentCheck.stderr || independentCheck.stdout);
    assertIncludes(independentCheck.stdout, `extension ${nextExtensionVersion}; MCP ${nextMcpVersion}`);

    const firstSetDigests = targetDigests(fixtureRoot, targets);
    const secondExtensionSet = run(['extension', nextExtensionVersion], fixtureRoot);
    const secondMcpSet = run(['mcp', nextMcpVersion], fixtureRoot);
    assert.equal(secondExtensionSet.status, 0, secondExtensionSet.stderr || secondExtensionSet.stdout);
    assert.equal(secondMcpSet.status, 0, secondMcpSet.stderr || secondMcpSet.stdout);
    assertIncludes(secondExtensionSet.stdout, `already synchronized at ${nextExtensionVersion}`);
    assertIncludes(secondMcpSet.stdout, `already synchronized at ${nextMcpVersion}`);
    assert.deepEqual(targetDigests(fixtureRoot, targets), firstSetDigests, 'idempotent setters changed output');

    const synchronizedReadme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      synchronizedReadme.replace(`> FSB v${nextExtensionVersion} is functional`, '> FSB v9.9.9 is functional'),
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
    assertIncludes(mcpDrift.stderr, `MCP server metadata version: expected ${nextMcpVersion}, got 9.9.9`);
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
      synchronizedMcpReadme.replace("### What's New In v0.7.4", `### What's New In v${nextMcpVersion}`),
    );
    const duplicateHeading = run(['--check'], fixtureRoot);
    assert.notEqual(duplicateHeading.status, 0, 'check accepted duplicate MCP release headings');
    assert.match(duplicateHeading.stderr, /MCP README contains duplicate What's New release headings/u);
    fs.writeFileSync(mcpReadmePath, synchronizedMcpReadme);

    // An MCP minor with no declared compatibility is refused before any write.
    const mcpChangelogPath = path.join(fixtureRoot, 'mcp/CHANGELOG.md');
    const synchronizedMcpChangelog = fs.readFileSync(mcpChangelogPath, 'utf8');
    prepareMcpChangelog(fixtureRoot, '0.99.0');
    const beforeUndeclaredMcp = targetDigests(fixtureRoot, targets);
    const undeclaredMcp = run(['mcp', '0.99.0'], fixtureRoot);
    assert.notEqual(undeclaredMcp.status, 0, 'MCP setter accepted a release with no declared extension compatibility');
    assertIncludes(
      undeclaredMcp.stderr,
      'version-sync: no declared extension compatibility for MCP 0.99.0; add it to scripts/lib/mcp-extension-compat.mjs',
    );
    assert.deepEqual(
      targetDigests(fixtureRoot, targets),
      beforeUndeclaredMcp,
      'undeclared MCP compatibility left partial writes',
    );
    fs.writeFileSync(mcpChangelogPath, synchronizedMcpChangelog);

    if (process.platform !== 'win32') {
      prepareExtensionChangelog(fixtureRoot, rollbackExtensionVersion);
      const beforeCommitFailure = targetDigests(fixtureRoot, targets);
      const rootLockPath = path.join(fixtureRoot, 'package-lock.json');
      fs.chmodSync(rootLockPath, 0o444);
      const commitFailure = run(['extension', rollbackExtensionVersion], fixtureRoot);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
