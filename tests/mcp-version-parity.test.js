'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

const repoRoot = path.resolve(__dirname, '..');
const expectedReleaseVersion = '0.11.0';

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function extractRuntimeVersion(versionSource) {
  const match = versionSource.match(/FSB_MCP_VERSION = '([^']+)'/);
  return match ? match[1] : null;
}

function extractLatestChangelogVersion(changelogSource) {
  const match = changelogSource.match(/^## (\d+\.\d+\.\d+)(?:\s|$)/m);
  return match ? match[1] : null;
}

function collectExplicitVersions(text) {
  const matches = [];
  const patterns = [
    /fsb-mcp-server@(\d+\.\d+\.\d+)/g,
    /FSB MCP Server (\d+\.\d+\.\d+)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      matches.push(match[1]);
      match = pattern.exec(text);
    }
  }

  return matches;
}

function runCommand(command) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

async function run() {
  const packageJson = readJson('mcp/package.json');
  const packageLock = readJson('mcp/package-lock.json');
  const serverJson = readJson('mcp/server.json');
  const versionSource = readText('mcp/src/version.ts');
  const packageReadme = readText('mcp/README.md');
  const packageChangelog = readText('mcp/CHANGELOG.md');
  const publishWorkflow = readText('.github/workflows/npm-publish.yml');
  const rootReadme = readText('README.md');
  const rootChangelog = readText('CHANGELOG.md');
  const llmsSource = readText('showcase/angular/scripts/llms.source.md');
  const llmsFullSource = readText('showcase/angular/scripts/llms-full.source.md');
  const llmsPublic = readText('showcase/angular/public/llms.txt');
  const llmsFullPublic = readText('showcase/angular/public/llms-full.txt');
  const canonicalVersion = packageJson.version;

  console.log('\n--- metadata parity ---');
  assertEqual(canonicalVersion, expectedReleaseVersion, 'mcp/package.json advances to the intended release version');
  assertEqual(packageLock.version, canonicalVersion, 'mcp/package-lock.json top-level version matches canonical package version');
  assertEqual(packageLock.packages[''].version, canonicalVersion, 'mcp/package-lock.json root package version matches canonical package version');
  assertEqual(extractRuntimeVersion(versionSource), canonicalVersion, 'FSB_MCP_VERSION matches canonical package version');
  assertEqual(serverJson.version, canonicalVersion, 'server.json top-level version matches canonical package version');
  assertEqual(serverJson.packages[0].version, canonicalVersion, 'server.json package version matches canonical package version');

  console.log('\n--- release documentation parity ---');
  assertEqual(extractLatestChangelogVersion(packageChangelog), canonicalVersion, 'latest MCP changelog entry matches canonical package version');
  assert(packageChangelog.includes('`mcp:task-status`'), 'MCP changelog documents the new task-status wire contract');
  assert(packageChangelog.includes(`fsb-mcp-server@${canonicalVersion}`), 'MCP changelog names the current publish artifact');
  assert(packageReadme.includes(`### What's New In v${canonicalVersion}`), 'MCP README has a current release summary');
  assert(packageReadme.includes(`### Releasing ${canonicalVersion}`), 'MCP README release instructions match canonical package version');
  assert(packageReadme.includes(`git tag mcp-v${canonicalVersion} && git push origin mcp-v${canonicalVersion}`), 'MCP README uses the MCP-only release tag');
  assert(!packageReadme.includes(`git tag v${canonicalVersion}`), 'MCP README does not use a repository milestone tag for npm publishing');
  assert(packageReadme.includes('requires FSB extension 0.9.91 or newer'), 'MCP README documents extension compatibility for task-status');
  assert(publishWorkflow.includes("- 'mcp-v*'"), 'npm publish workflow is restricted to MCP release tags');
  const currentProductRelease = rootChangelog
    .split(/^## /m)
    .find(section => section.startsWith('v0.9.91 '));
  assert(currentProductRelease && currentProductRelease.includes(`fsb-mcp-server\` advances to \`${canonicalVersion}`),
    'current product changelog names the independently versioned MCP release');
  for (const [name, content] of [
    ['LLM summary source', llmsSource],
    ['LLM full source', llmsFullSource],
    ['generated LLM summary', llmsPublic],
    ['generated LLM full text', llmsFullPublic],
  ]) {
    assert(content.includes(`fsb-mcp-server ${canonicalVersion}`), `${name} advertises the canonical MCP release`);
  }

  console.log('\n--- cli output parity ---');
  const helpOutput = runCommand('node mcp/build/index.js help');
  const installOutput = runCommand('node mcp/build/index.js install');
  assert(helpOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'help output prints canonical MCP version');
  assert(installOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'install output prints canonical MCP version');

  console.log('\n--- docs flow parity ---');
  assert(packageReadme.includes('doctor'), 'mcp README mentions doctor');
  assert(packageReadme.includes('status --watch'), 'mcp README mentions status --watch');
  assert(rootReadme.includes('doctor'), 'root README mentions doctor');
  assert(rootReadme.includes('status --watch'), 'root README mentions status --watch');

  const explicitVersions = [
    ...collectExplicitVersions(packageReadme),
    ...collectExplicitVersions(rootReadme),
  ];
  for (const version of explicitVersions) {
    assertEqual(version, canonicalVersion, `explicit README MCP version reference stays on ${canonicalVersion}`);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
