import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Local 1Password connection settings for the FSB server.
 *
 * Lives next to bridge-auth.json in ~/.fsb with owner-only permissions. The
 * service-account token is the only secret here; it is written by the
 * `fsb-mcp-server onepassword service-account` command, never by the extension,
 * and it is never returned over the bridge.
 */

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_VAULTS = 32;

export const ONEPASSWORD_ACCOUNT_ENV = 'FSB_1PASSWORD_ACCOUNT';
export const ONEPASSWORD_TOKEN_ENV = 'OP_SERVICE_ACCOUNT_TOKEN';

export type OnePasswordAuthConfig =
  | { kind: 'desktop'; accountName: string }
  | { kind: 'service-account'; token: string | null };

/**
 * Which vaults FSB reads. 'all' covers every vault the sign-in can see except
 * transfer and unsupported ones. 'listed' covers vaultIds only. A config
 * written before this setting existed has an allowlist and stays 'listed'.
 */
export type OnePasswordVaultScope = 'all' | 'listed';

export interface OnePasswordConfig {
  version: 1;
  auth: OnePasswordAuthConfig | null;
  vaultScope: OnePasswordVaultScope;
  /** The allowlist. Always empty when vaultScope is 'all'. */
  vaultIds: string[];
  saveVaultId: string | null;
  /**
   * True before any sign-in and after a sign-in to a new desktop account. The
   * first time the broker lists vaults with every vault in scope and no save
   * vault, it picks the Personal vault and clears this, so a later "Do not
   * save" from the user is never overridden.
   */
  pickPersonalSaveVault: boolean;
  updatedAt: number;
}

const VAULT_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
const ACCOUNT_NAME_MAX = 200;
const TOKEN_PATTERN = /^ops_[A-Za-z0-9+/=_.-]{20,4096}$/;

export function getOnePasswordConfigPath(homeDir = homedir()): string {
  return join(homeDir, '.fsb', 'onepassword.json');
}

/** Settings for someone who has never connected: every vault, nothing saved yet. */
export function emptyOnePasswordConfig(now = Date.now()): OnePasswordConfig {
  return {
    version: 1,
    auth: null,
    vaultScope: 'all',
    vaultIds: [],
    saveVaultId: null,
    pickPersonalSaveVault: true,
    updatedAt: now,
  };
}

export function isVaultScope(value: unknown): value is OnePasswordVaultScope {
  return value === 'all' || value === 'listed';
}

export function isValidVaultId(value: unknown): value is string {
  return typeof value === 'string' && VAULT_ID_PATTERN.test(value);
}

export function isValidAccountName(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= ACCOUNT_NAME_MAX
    && !/[\u0000-\u001f]/.test(value);
}

export function isPlausibleServiceAccountToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value.trim());
}

function normalizeVaultIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (isValidVaultId(entry) && !ids.includes(entry)) ids.push(entry);
    if (ids.length >= MAX_VAULTS) break;
  }
  return ids;
}

function normalizeAuth(value: unknown): OnePasswordAuthConfig | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'desktop' && isValidAccountName(record.accountName)) {
    return { kind: 'desktop', accountName: record.accountName.trim() };
  }
  if (record.kind === 'service-account') {
    const token = isPlausibleServiceAccountToken(record.token) ? String(record.token).trim() : null;
    return { kind: 'service-account', token };
  }
  return null;
}

export function normalizeOnePasswordConfig(value: unknown): OnePasswordConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const vaultScope: OnePasswordVaultScope = record.vaultScope === 'all' ? 'all' : 'listed';
  const vaultIds = vaultScope === 'all' ? [] : normalizeVaultIds(record.vaultIds);
  // With every vault in scope there is no allowlist to check the save vault
  // against here; the broker checks it against the vaults 1Password lists.
  const saveVaultId = isValidVaultId(record.saveVaultId)
    && (vaultScope === 'all' || vaultIds.includes(record.saveVaultId))
    ? record.saveVaultId
    : null;
  return {
    version: 1,
    auth: normalizeAuth(record.auth),
    vaultScope,
    vaultIds,
    saveVaultId,
    pickPersonalSaveVault: record.pickPersonalSaveVault === true,
    updatedAt: Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : 0,
  };
}

export function readOnePasswordConfig(path = getOnePasswordConfigPath()): OnePasswordConfig | null {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_CONFIG_BYTES) return null;
    return normalizeOnePasswordConfig(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

function assertWritableTarget(path: string): void {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('1Password config path is not a regular file');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
}

export function writeOnePasswordConfig(
  config: OnePasswordConfig,
  path = getOnePasswordConfigPath(),
): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  const dirStat = lstatSync(directory);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error('1Password config directory is not a directory');
  }
  try {
    chmodSync(directory, DIRECTORY_MODE);
  } catch {
    // Best effort on platforms without POSIX modes.
  }
  assertWritableTarget(path);

  const tempPath = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      tempPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    writeFileSync(descriptor, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(tempPath, FILE_MODE);
    renameSync(tempPath, path);
    chmodSync(path, FILE_MODE);
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original error.
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // Temp file may not exist.
    }
    throw error;
  }
}

export function removeOnePasswordConfig(path = getOnePasswordConfigPath()): void {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.isFile()) unlinkSync(path);
  } catch {
    // Nothing to remove.
  }
}
