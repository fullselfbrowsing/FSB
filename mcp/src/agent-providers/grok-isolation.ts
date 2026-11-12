import { realpathSync } from 'node:fs';

export interface GrokBuildIsolationExpectation {
  readonly expectedCliVersion: string;
  readonly cwd: string;
  readonly configPath: string;
}

const REQUIRED_IMPORTS = Object.freeze([
  'cursor:skills', 'cursor:rules', 'cursor:agents', 'cursor:mcps',
  'cursor:hooks', 'cursor:sessions', 'claude:skills', 'claude:rules',
  'claude:agents', 'claude:mcps', 'claude:hooks', 'claude:sessions',
  'codex:sessions',
]);

const KNOWN_PERMISSION_FIELDS = new Set([
  'sources', 'loaded', 'skipped', 'mcpServerAllowlist', 'marketplaceAllowlist',
  'managedSettingsExists', 'managedSettingsActive', 'managedSettingsPath',
  'mcpLockdownSources', 'mcpManagedServersOnly', 'marketplaceLockdownSources',
  'managedMarketplaces', 'claudeBypassLockAdvisory',
]);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function emptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function samePath(value: unknown, expected: string): boolean {
  if (typeof value !== 'string' || value.includes('\0')) return false;
  if (value === expected) return true;
  try {
    return realpathSync(value) === realpathSync(expected);
  } catch {
    return false;
  }
}

/** Validate effective authority rather than upstream presentation or JSON order. */
export function validateGrokBuildIsolation(
  value: unknown,
  expected: GrokBuildIsolationExpectation,
): boolean {
  if (!record(value) || value.grokVersion !== expected.expectedCliVersion
      || !samePath(value.cwd, expected.cwd)
      || value.projectRoot !== null || value.projectTrusted !== true) return false;
  for (const key of [
    'projectInstructions', 'hooks', 'skills', 'plugins', 'marketplaces',
    'mcpServers', 'lspServers',
  ]) {
    if (!emptyArray(value[key])) return false;
  }
  const permissions = value.permissions;
  if (!record(permissions) || permissions.loaded !== 1
      || permissions.managedSettingsExists !== false
      || permissions.managedSettingsActive !== false
      || !Array.isArray(permissions.sources) || permissions.sources.length !== 1) return false;
  const source = permissions.sources[0];
  if (typeof source !== 'string' || !source.endsWith(' (config)')
      || !samePath(source.slice(0, -' (config)'.length), expected.configPath)) return false;
  for (const key of ['skipped', 'mcpServerAllowlist', 'marketplaceAllowlist']) {
    if (!emptyArray(permissions[key])) return false;
  }
  // Newer CLIs report these additional sources. None may introduce authority.
  for (const key of [
    'mcpLockdownSources', 'marketplaceLockdownSources', 'managedMarketplaces',
  ]) {
    if (Object.hasOwn(permissions, key) && !emptyArray(permissions[key])) return false;
  }
  if (Object.hasOwn(permissions, 'mcpManagedServersOnly')
      && permissions.mcpManagedServersOnly !== 'off') return false;
  if (Object.hasOwn(permissions, 'claudeBypassLockAdvisory')
      && permissions.claudeBypassLockAdvisory !== false) return false;
  if (Object.hasOwn(permissions, 'managedSettingsPath')
      && (typeof permissions.managedSettingsPath !== 'string'
        || permissions.managedSettingsPath.length > 4096)) return false;
  for (const [key, setting] of Object.entries(permissions)) {
    if (KNOWN_PERMISSION_FIELDS.has(key)) continue;
    // Unknown controls may be disabled/empty, but cannot grant new authority.
    if (setting === false || setting === null || setting === 0 || setting === ''
        || emptyArray(setting) || (record(setting) && Object.keys(setting).length === 0)) continue;
    return false;
  }

  if (!Array.isArray(value.agents) || value.agents.length > 256
      || !value.agents.every((agent) => record(agent)
        && typeof agent.name === 'string' && record(agent.source)
        && agent.source.type === 'builtin')) return false;
  const sources = value.configSources;
  if (!record(sources) || !Array.isArray(sources.layers) || sources.layers.length !== 1) return false;
  const layer = sources.layers[0];
  if (!record(layer) || layer.role !== 'user' || !samePath(layer.path, expected.configPath)) return false;

  const imports = value.externalCompat;
  if (!record(imports) || imports.remoteSettingsLoaded !== false
      || !Array.isArray(imports.cells) || imports.cells.length > 256) return false;
  const seen = new Set<string>();
  for (const cell of imports.cells) {
    if (!record(cell) || typeof cell.vendor !== 'string'
        || typeof cell.surface !== 'string' || cell.enabled !== false
        || typeof cell.source !== 'string') return false;
    const key = `${cell.vendor}:${cell.surface}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (REQUIRED_IMPORTS.includes(key) && cell.source !== 'env') return false;
  }
  return REQUIRED_IMPORTS.every((key) => seen.has(key));
}
