'use strict';

/**
 * Release-documentation parity rules, shared by tests/mcp-version-parity.test.js
 * (the repository documents) and tests/release-version-rehearsal.test.js (the
 * temp-root release rehearsal, Phase 71 D-20), so each phrase is defined once.
 *
 * compatMinimum is the MCP release's declared minimum extension version
 * (scripts/lib/mcp-extension-compat.mjs compatFor(mcpVersion).minimum, D-22),
 * never the current extension version.
 *
 * Pure: the callers read the documents and print the results.
 */

function latestMcpChangelogVersion(packageChangelog) {
  const match = String(packageChangelog).match(/^## (\d+\.\d+\.\d+)(?:\s|$)/m);
  return match ? match[1] : null;
}

function currentProductRelease(rootChangelog, extensionVersion) {
  return String(rootChangelog)
    .split(/^## /m)
    .find((section) => section.startsWith(`v${extensionVersion} `)) || null;
}

function requireString(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`releaseDocParityChecks: ${name} must be a non-empty string`);
  }
}

/**
 * @returns {{ok: boolean, msg: string}[]} one entry per rule, in a fixed order
 */
function releaseDocParityChecks({
  rootChangelog,
  packageReadme,
  packageChangelog,
  extensionVersion,
  mcpVersion,
  compatMinimum,
} = {}) {
  for (const [name, value] of Object.entries({
    rootChangelog,
    packageReadme,
    packageChangelog,
    extensionVersion,
    mcpVersion,
    compatMinimum,
  })) {
    requireString(name, value);
  }

  const latest = latestMcpChangelogVersion(packageChangelog);
  const productRelease = currentProductRelease(rootChangelog, extensionVersion);
  return [
    {
      ok: latest === mcpVersion,
      msg: `latest MCP changelog entry matches canonical package version (expected: ${mcpVersion}, got: ${latest})`,
    },
    {
      ok: packageChangelog.includes('`mcp:task-status`'),
      msg: 'MCP changelog documents the new task-status wire contract',
    },
    {
      ok: packageChangelog.includes(`fsb-mcp-server@${mcpVersion}`),
      msg: 'MCP changelog names the current publish artifact',
    },
    {
      ok: packageReadme.includes(`### What's New In v${mcpVersion}`),
      msg: 'MCP README has a current release summary',
    },
    {
      ok: packageReadme.includes(`### Releasing ${mcpVersion}`),
      msg: 'MCP README release instructions match canonical package version',
    },
    {
      ok: packageReadme.includes(`git tag mcp-v${mcpVersion} && git push origin mcp-v${mcpVersion}`),
      msg: 'MCP README uses the MCP-only release tag',
    },
    {
      ok: packageReadme.includes(`MCP ${mcpVersion} requires extension ${compatMinimum} or newer`),
      msg: 'MCP README documents independent compatibility requirements',
    },
    {
      ok: Boolean(productRelease
        && productRelease.includes(`align at \`${extensionVersion}\``)
        && (productRelease.includes(`advances to \`${mcpVersion}\``)
          || productRelease.includes(`stays at \`${mcpVersion}\``))),
      msg: 'current product changelog documents the independent extension and MCP releases',
    },
  ];
}

module.exports = {
  releaseDocParityChecks,
  latestMcpChangelogVersion,
  currentProductRelease,
};
