'use strict';

/**
 * Phase 71 D-20 / REL-01-a / REL-02-a: rehearse the two-step v1.0.0 release
 * in a temp root, in release order.
 *
 *   Step A (M-71-10): extension 1.0.0 while fsb-mcp-server stays where it is.
 *   Step B (M-71-11): fsb-mcp-server 0.12.0 on top of step A.
 *
 * Every `--print-targets` file is copied into a temp root and the real setter
 * runs there with FSB_VERSION_SYNC_ROOT. The fixture entries are authored by
 * string edits in the temp root only; every repository target's sha256 is
 * checked before and after. No git, no network, no ports.
 *
 * The real bumps run `npm test` right after each step (M-71-10 and M-71-11,
 * step 5), so a step the repository has already released is checked on the
 * repository's own documents instead of being rehearsed again. The suite also
 * re-runs itself on the temp states after step A and after step B to prove it
 * stays green there.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { releaseDocParityChecks } = require('./helpers/release-doc-parity');

const repositoryRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repositoryRoot, 'scripts', 'sync-product-version.mjs');
const compatPath = path.join(repositoryRoot, 'scripts', 'lib', 'mcp-extension-compat.mjs');

const STEP_A_EXTENSION = '1.0.0';
const STEP_A_HEADING = `## v${STEP_A_EXTENSION} — Fixture Jev Fast Mode — 2026-11-01`;
const STEP_B_MCP = '0.12.0';
const STEP_B_DATE = '2026-11-15';
const STEP_B_PARAGRAPH = `MCP-only update (${STEP_B_DATE}): the package advances to \`${STEP_B_MCP}\` for the \`settings\` tool and the optional \`expect\` parameter.`;
const PRODUCT_RELEASE_RULE = 'current product changelog documents the independent extension and MCP releases';

const workRoots = [];
let compat = null;

function run(args, root) {
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

function newRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-release-rehearsal-'));
  workRoots.push(root);
  return root;
}

function copyTargets(fromRoot, toRoot, targets) {
  for (const target of targets) {
    const destination = path.join(toRoot, target);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(fromRoot, target), destination);
  }
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function writeText(root, relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function assertIncludes(actual, expected) {
  assert(actual.includes(expected), `Expected ${JSON.stringify(expected)} in:\n${actual}`);
}

function assertExcludes(actual, unexpected, message) {
  assert(!actual.includes(unexpected), `${message}: found ${JSON.stringify(unexpected)}`);
}

function assertOk(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
}

function assertRefusedWithoutWrites(root, targets, args, expected, label) {
  const before = targetDigests(root, targets);
  const result = run(args, root);
  assert.equal(result.status, 1, `${label} exited ${result.status}: ${result.stdout}`);
  assert.match(result.stderr, /^version-sync: /u);
  assertIncludes(result.stderr, expected);
  assert.deepEqual(targetDigests(root, targets), before, `${label} changed a release target`);
}

function parityChecks(root, extensionVersion, mcpVersion) {
  return releaseDocParityChecks({
    rootChangelog: readText(root, 'CHANGELOG.md'),
    packageReadme: readText(root, 'mcp/README.md'),
    packageChangelog: readText(root, 'mcp/CHANGELOG.md'),
    extensionVersion,
    mcpVersion,
    compatMinimum: compat.compatFor(mcpVersion).minimum,
  });
}

function assertParity(root, extensionVersion, mcpVersion) {
  const checks = parityChecks(root, extensionVersion, mcpVersion);
  assert.equal(checks.length, 8, 'the shared helper returns its eight release-documentation rules');
  assert.deepEqual(
    checks.filter((check) => !check.ok).map((check) => check.msg),
    [],
    `release documents at extension ${extensionVersion} / MCP ${mcpVersion}`,
  );
}

function parityErrorLines(stderr) {
  return stderr.split('\n').filter((line) => line.startsWith('- '));
}

// A released step is checked on the documents it left behind.
function checkReleasedDocuments(root, extensionVersion, mcpVersion) {
  assertParity(root, extensionVersion, mcpVersion);
  const readme = readText(root, 'mcp/README.md');
  assertIncludes(readme, compat.compatBullet(mcpVersion));
  assertIncludes(readme, compat.compatPairLine(mcpVersion));
}

function rehearseStepA(root, targets, previousExtension, mcpVersion) {
  const extension = STEP_A_EXTENSION;

  // The setter refuses until CHANGELOG.md has `## v1.0.0` as its first release heading.
  assertRefusedWithoutWrites(
    root,
    targets,
    ['extension', extension],
    `author the ${extension} entry at the top of CHANGELOG.md`,
    'step A without its changelog entry',
  );

  const changelog = readText(root, 'CHANGELOG.md');
  const firstRelease = /^## v\d+\.\d+\.\d+\b/mu;
  assert.match(changelog, firstRelease);
  writeText(root, 'CHANGELOG.md', changelog.replace(firstRelease, (heading) => [
    STEP_A_HEADING,
    '',
    `The extension, showcase, skill, documentation, and store metadata align at \`${extension}\`. The independently versioned \`fsb-mcp-server\` stays at \`${mcpVersion}\`.`,
    '',
    'Fixture release notes.',
    '',
    heading,
  ].join('\n')));
  const authoredChangelog = readText(root, 'CHANGELOG.md');

  const set = run(['extension', extension], root);
  assertOk(set, 'step A setter');
  assertIncludes(set.stdout, `version-set:extension: updated ${extension}`);
  assert.equal(readJson(root, 'extension/manifest.json').version, extension);
  assert.equal(readJson(root, 'mcp/package.json').version, mcpVersion, 'step A moved the MCP version');

  // The setter never writes the changelog header line, and --check requires it.
  assert.equal(readText(root, 'CHANGELOG.md'), authoredChangelog, 'the extension setter rewrote CHANGELOG.md');
  assertIncludes(authoredChangelog, `The extension version is \`${previousExtension}\``);
  const headerMissing = run(['--check'], root);
  assert.equal(headerMissing.status, 1, `--check accepted the stale header line: ${headerMissing.stdout}`);
  assert.deepEqual(
    parityErrorLines(headerMissing.stderr),
    [`- extension changelog current-version summary: missing "The extension version is \`${extension}\`"`],
    'the stale header line is the only step-A parity error',
  );

  const header = /The extension version is `\d+\.\d+\.\d+`/u;
  writeText(root, 'CHANGELOG.md', authoredChangelog.replace(header, `The extension version is \`${extension}\``));
  const check = run(['--check'], root);
  assertOk(check, 'step A --check');
  assertIncludes(check.stdout, `version-check: extension ${extension}; MCP ${mcpVersion}`);
  assertParity(root, extension, mcpVersion);

  // The step-A trap (D-22): the unchanged MCP release keeps its own declared minimum.
  const readme = readText(root, 'mcp/README.md');
  assertIncludes(readme, `MCP ${mcpVersion} requires extension ${compat.compatFor(mcpVersion).minimum} or newer`);
  assertIncludes(readme, compat.compatPairLine(mcpVersion));
  assertIncludes(readme, compat.compatBullet(mcpVersion));
  assertExcludes(readme, `requires extension ${extension}`, `step A claimed MCP ${mcpVersion} needs extension ${extension}`);
  assertExcludes(readme, `requires FSB extension ${extension}`, `step A claimed MCP ${mcpVersion} needs extension ${extension}`);
  assertIncludes(readme, `published independently from the extension release (\`${extension}\`)`);
}

function rehearseStepB(root, targets, extensionVersion, previousMcp) {
  const mcp = STEP_B_MCP;

  // The setter refuses until mcp/CHANGELOG.md has the anchor and the heading.
  assertRefusedWithoutWrites(
    root,
    targets,
    ['mcp', mcp],
    `author the ${mcp} entry at the top of mcp/CHANGELOG.md`,
    'step B without its changelog entry',
  );

  const mcpChangelog = readText(root, 'mcp/CHANGELOG.md');
  const firstAnchor = /^<a id="v\d+\.\d+\.\d+"><\/a>$/mu;
  assert.match(mcpChangelog, firstAnchor);
  writeText(root, 'mcp/CHANGELOG.md', mcpChangelog.replace(firstAnchor, (anchor) => [
    `<a id="v${mcp}"></a>`,
    '',
    `## ${mcp} (${STEP_B_DATE})`,
    '',
    'Fixture minor release adding the `settings` tool and the optional `expect` parameter.',
    '',
    `- Merging this release into \`main\` publishes \`fsb-mcp-server@${mcp}\`.`,
    '',
    anchor,
  ].join('\n')));

  // Pitfall 5: the new section must take the single Compatibility bullet, not a copy of it.
  const readme = readText(root, 'mcp/README.md');
  const bullets = readme.match(/^- \*\*Compatibility:\*\* .*$/gmu) || [];
  assert.equal(bullets.length, 1, 'the README has one current Compatibility bullet');
  const bullet = bullets[0];
  const firstWhatsNew = /^### What's New In v\d+\.\d+\.\d+$/mu;
  const newSection = (lines) => [`### What's New In v${mcp}`, '', ...lines, '', ''].join('\n');
  const fixtureNote = '- Fixture notes: the `settings` tool and the optional `expect` parameter.';

  writeText(root, 'mcp/README.md', readme.replace(
    firstWhatsNew,
    (heading) => `${newSection([fixtureNote, bullet])}${heading}`,
  ));
  assertRefusedWithoutWrites(
    root,
    targets,
    ['mcp', mcp],
    'mcp/README.md: expected exactly one MCP README current compatibility summary; found 2',
    'step B with a copied Compatibility bullet',
  );

  const bulletLine = `${bullet}\n`;
  assert.equal(readme.split(bulletLine).length, 2, 'the Compatibility bullet is one whole line');
  writeText(root, 'mcp/README.md', readme.replace(bulletLine, '').replace(
    firstWhatsNew,
    (heading) => `${newSection([fixtureNote, bullet])}${heading}`,
  ));

  // The product changelog needs the MCP-only paragraph in the current release section.
  const changelog = readText(root, 'CHANGELOG.md');
  const productRule = parityChecks(root, extensionVersion, mcp).find((check) => check.msg === PRODUCT_RELEASE_RULE);
  assert.equal(productRule.ok, false, 'the product changelog passed before the MCP-only paragraph was written');
  const sectionStart = changelog.indexOf(`\n## v${extensionVersion} `);
  assert(sectionStart >= 0, `CHANGELOG.md has a v${extensionVersion} section`);
  const firstParagraphStart = changelog.indexOf('\n\n', sectionStart + 1);
  const firstParagraphEnd = changelog.indexOf('\n\n', firstParagraphStart + 2);
  assert(firstParagraphStart > sectionStart && firstParagraphEnd > firstParagraphStart, 'the release section has a first paragraph');
  writeText(
    root,
    'CHANGELOG.md',
    `${changelog.slice(0, firstParagraphEnd)}\n\n${STEP_B_PARAGRAPH}${changelog.slice(firstParagraphEnd)}`,
  );

  const set = run(['mcp', mcp], root);
  assertOk(set, 'step B setter');
  assertIncludes(set.stdout, `version-set:mcp: updated ${mcp}`);
  assert.equal(readJson(root, 'mcp/package.json').version, mcp);
  assert.equal(readJson(root, 'extension/manifest.json').version, extensionVersion, 'step B moved the extension version');

  const after = readText(root, 'mcp/README.md');
  const headings = [...after.matchAll(/^### What's New In v(\d+\.\d+\.\d+)$/gmu)].map((match) => match[1]);
  assert.deepEqual(headings.slice(0, 2), [mcp, previousMcp], 'the new section sits above the previous release');
  const newHeadingAt = after.indexOf(`### What's New In v${mcp}`);
  const previousHeadingAt = after.indexOf(`### What's New In v${previousMcp}`);
  const bulletAt = after.indexOf(compat.compatBullet(mcp));
  assert(bulletAt > newHeadingAt && bulletAt < previousHeadingAt, 'the Compatibility bullet moved into the new section');

  const declared = compat.compatFor(mcp);
  assertIncludes(after, `MCP ${mcp} requires extension ${declared.minimum} or newer`);
  assertIncludes(after, compat.compatPairLine(mcp));
  const pairLine = after.match(/^Compatibility for this release: .*$/mu)[0];
  assert(declared.feature, `MCP ${mcp} declares a feature requirement`);
  for (const name of declared.feature.names) assertIncludes(pairLine, `\`${name}\``);
  assertIncludes(pairLine, `need extension ${declared.feature.version} or newer`);
  assertExcludes(after, `MCP ${mcp} requires extension ${declared.feature.version}`, 'step B raised the minimum for existing tools');

  const check = run(['--check'], root);
  assertOk(check, 'step B --check');
  assertIncludes(check.stdout, `version-check: extension ${extensionVersion}; MCP ${mcp}`);
  assertParity(root, extensionVersion, mcp);
}

function rehearse(sourceRoot, targets) {
  const extensionVersion = readJson(sourceRoot, 'extension/manifest.json').version;
  const mcpVersion = readJson(sourceRoot, 'mcp/package.json').version;
  const outcome = {
    from: `extension ${extensionVersion} / MCP ${mcpVersion}`,
    stepA: 'released',
    stepB: 'released',
    afterStepA: null,
    afterStepB: null,
  };
  const stepAApplies = compareVersions(extensionVersion, STEP_A_EXTENSION) < 0;
  const stepBApplies = compareVersions(mcpVersion, STEP_B_MCP) < 0;
  if (!stepAApplies || !stepBApplies) checkReleasedDocuments(sourceRoot, extensionVersion, mcpVersion);
  if (!stepAApplies && !stepBApplies) return outcome;

  const root = newRoot();
  copyTargets(sourceRoot, root, targets);
  let releasedExtension = extensionVersion;
  if (stepAApplies) {
    rehearseStepA(root, targets, extensionVersion, mcpVersion);
    releasedExtension = STEP_A_EXTENSION;
    outcome.stepA = 'rehearsed';
    outcome.afterStepA = newRoot();
    copyTargets(root, outcome.afterStepA, targets);
  }
  if (stepBApplies) {
    rehearseStepB(root, targets, releasedExtension, mcpVersion);
    outcome.stepB = 'rehearsed';
    outcome.afterStepB = root;
  }
  return outcome;
}

async function main() {
  compat = await import(pathToFileURL(compatPath).href);

  const listed = run(['--print-targets'], repositoryRoot);
  assertOk(listed, '--print-targets');
  const targets = JSON.parse(listed.stdout);
  for (const required of ['CHANGELOG.md', 'mcp/CHANGELOG.md', 'mcp/README.md', 'extension/manifest.json', 'mcp/package.json']) {
    assert(targets.includes(required), `--print-targets lists ${required}`);
  }
  const repositoryBefore = targetDigests(repositoryRoot, targets);

  try {
    const fromRepository = rehearse(repositoryRoot, targets);
    console.log(`release-version-rehearsal: from ${fromRepository.from}: step A ${fromRepository.stepA}, step B ${fromRepository.stepB}`);

    // M-71-10 and M-71-11 run npm test right after each real bump.
    if (fromRepository.afterStepA) {
      const afterStepA = rehearse(fromRepository.afterStepA, targets);
      assert.deepEqual([afterStepA.stepA, afterStepA.stepB], ['released', fromRepository.stepB]);
      console.log(`release-version-rehearsal: from ${afterStepA.from}: step A ${afterStepA.stepA}, step B ${afterStepA.stepB}`);
    }
    if (fromRepository.afterStepB) {
      const afterStepB = rehearse(fromRepository.afterStepB, targets);
      assert.deepEqual([afterStepB.stepA, afterStepB.stepB], ['released', 'released']);
      console.log(`release-version-rehearsal: from ${afterStepB.from}: step A ${afterStepB.stepA}, step B ${afterStepB.stepB}`);
    }
  } finally {
    for (const root of workRoots) fs.rmSync(root, { recursive: true, force: true });
  }

  for (const root of workRoots) assert(!fs.existsSync(root), `temp root ${root} was not removed`);
  assert.deepEqual(
    targetDigests(repositoryRoot, targets),
    repositoryBefore,
    'the rehearsal changed a repository file',
  );
  console.log('release-version-rehearsal: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
