/**
 * The declared minimum FSB extension version for each fsb-mcp-server release
 * (Phase 71 D-22).
 *
 * The version setter (scripts/sync-product-version.mjs) writes the MCP README
 * compatibility bullet and the "Compatibility for this release" line from this
 * map, and its --check reads the same minimum. The tests read it too, so every
 * compatibility claim comes from one declared source. The setter imports this
 * file relative to itself, so a FSB_VERSION_SYNC_ROOT temp root uses the same
 * map as the repository.
 *
 * Lookup: an exact entry wins; otherwise the highest declared entry with the
 * same major.minor and a lower patch (a later patch release inherits the
 * declaration before it; an earlier patch never inherits a later one's, whose
 * reasons may name routes it lacks); otherwise compatFor throws. Releasing a new MCP minor therefore needs a new
 * entry here before `npm run version:set:mcp` can succeed.
 *
 * This module is pure: no file, environment or process access.
 */

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

function entry({ minimum, feature, bulletReason, pairReason }) {
  return Object.freeze({
    minimum,
    feature: feature
      ? Object.freeze({ version: feature.version, names: Object.freeze([...feature.names]) })
      : null,
    bulletReason,
    pairReason,
  });
}

export const MCP_EXTENSION_COMPAT = Object.freeze({
  '0.11.2': entry({
    minimum: '0.9.92',
    feature: null,
    bulletReason: 'for `mcp:task-status`',
    pairReason: 'for the `mcp:task-status` route used by `complete_task`, `partial_task`, and `fail_task`. Existing `0.10.0` tool routes remain additive and unchanged.',
  }),
  // 66.1-03: older extensions answer SETTING_UNSUPPORTED; 69-06: they report
  // expect_result uncertain with extension_unsupported.
  '0.12.0': entry({
    minimum: '0.9.92',
    feature: { version: '1.0.0', names: ['settings', 'expect'] },
    bulletReason: 'for existing tools; `settings` and the optional `expect` need FSB extension 1.0.0 or newer',
    pairReason: 'for existing tools. `settings` and the optional `expect` need extension 1.0.0 or newer; older extensions answer `SETTING_UNSUPPORTED` and report `expect_result` as `uncertain` with `extension_unsupported`. Existing tool routes remain additive and unchanged.',
  }),
});

// The setter passes these sentences to String.prototype.replace, where `$` is
// special, and writes them as single README lines.
for (const [version, declared] of Object.entries(MCP_EXTENSION_COMPAT)) {
  for (const text of [declared.minimum, declared.bulletReason, declared.pairReason]) {
    if (typeof text !== 'string' || text.length === 0 || /[$\r\n]/u.test(text)) {
      throw new Error(`mcp-extension-compat: entry ${version} has an unusable sentence part`);
    }
  }
  if (!VERSION_PATTERN.test(version) || !VERSION_PATTERN.test(declared.minimum)) {
    throw new Error(`mcp-extension-compat: entry ${version} has a malformed version`);
  }
}

function undeclared(mcpVersion) {
  return new Error(
    `no declared extension compatibility for MCP ${mcpVersion}; add it to scripts/lib/mcp-extension-compat.mjs`,
  );
}

export function compatFor(mcpVersion) {
  const requested = VERSION_PATTERN.exec(String(mcpVersion));
  if (!requested) throw undeclared(mcpVersion);
  if (Object.prototype.hasOwnProperty.call(MCP_EXTENSION_COMPAT, mcpVersion)) {
    return MCP_EXTENSION_COMPAT[mcpVersion];
  }
  let inherited = null;
  let inheritedPatch = -1;
  for (const declaredVersion of Object.keys(MCP_EXTENSION_COMPAT)) {
    const [, major, minor, patch] = VERSION_PATTERN.exec(declaredVersion);
    if (major !== requested[1] || minor !== requested[2] || Number(patch) > Number(requested[3])) continue;
    if (Number(patch) > inheritedPatch) {
      inherited = MCP_EXTENSION_COMPAT[declaredVersion];
      inheritedPatch = Number(patch);
    }
  }
  if (!inherited) throw undeclared(mcpVersion);
  return inherited;
}

/** The `- **Compatibility:**` bullet under the current What's New heading. */
export function compatBullet(mcpVersion) {
  const declared = compatFor(mcpVersion);
  return `- **Compatibility:** \`fsb-mcp-server\` ${mcpVersion} requires FSB extension ${declared.minimum} or newer ${declared.bulletReason}. Upgrade the extension and restart the MCP host together.`;
}

/** The `Compatibility for this release:` line in the versioning section. */
export function compatPairLine(mcpVersion) {
  const declared = compatFor(mcpVersion);
  return `Compatibility for this release: MCP ${mcpVersion} requires extension ${declared.minimum} or newer ${declared.pairReason}`;
}
