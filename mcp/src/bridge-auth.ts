import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
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

export const FSB_EXT_PROTOCOL = 'fsb-ext-v1';
export const FSB_AUTH_PROTOCOL_PREFIX = 'fsb-auth.';

const AUTH_DIRECTORY_MODE = 0o700;
const AUTH_FILE_MODE = 0o600;
const SESSION_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[^/?#@]+$/;
const STATE_KEYS = [
  'allowedExtensionOrigin',
  'rotatedAt',
  'sessionId',
  'sessionSecret',
  'version',
];

export interface BridgeAuthState {
  version: 1;
  allowedExtensionOrigin: string | null;
  sessionSecret: string;
  sessionId: string;
  rotatedAt: number;
}

function isExactExtensionOrigin(value: unknown): value is string {
  return typeof value === 'string' && EXTENSION_ORIGIN_PATTERN.test(value);
}

function isValidSessionSecret(value: unknown): value is string {
  if (typeof value !== 'string' || !SESSION_SECRET_PATTERN.test(value)) return false;
  try {
    return Buffer.from(value, 'base64url').length === 32;
  } catch {
    return false;
  }
}

function isBridgeAuthState(value: unknown): value is BridgeAuthState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const keys = Object.keys(state).sort();
  if (keys.length !== STATE_KEYS.length || keys.some((key, index) => key !== STATE_KEYS[index])) {
    return false;
  }

  return state.version === 1
    && (state.allowedExtensionOrigin === null || isExactExtensionOrigin(state.allowedExtensionOrigin))
    && isValidSessionSecret(state.sessionSecret)
    && typeof state.sessionId === 'string'
    && SESSION_ID_PATTERN.test(state.sessionId)
    && typeof state.rotatedAt === 'number'
    && Number.isSafeInteger(state.rotatedAt)
    && state.rotatedAt >= 0;
}

function assertWritableTarget(path: string): void {
  if (!existsSync(path)) return;
  const target = lstatSync(path);
  if (target.isSymbolicLink() || !target.isFile()) {
    throw new Error('Bridge pairing state target is unavailable');
  }
}

function writeBridgeAuthState(path: string, state: BridgeAuthState): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: AUTH_DIRECTORY_MODE });
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error('Bridge pairing state directory is unavailable');
  }
  chmodSync(directory, AUTH_DIRECTORY_MODE);
  assertWritableTarget(path);

  const tempPath = join(
    directory,
    `.${randomBytes(12).toString('hex')}.bridge-auth.tmp`,
  );
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      tempPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      AUTH_FILE_MODE,
    );
    writeFileSync(descriptor, `${JSON.stringify(state)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(tempPath, AUTH_FILE_MODE);
    assertWritableTarget(path);
    renameSync(tempPath, path);
    chmodSync(path, AUTH_FILE_MODE);
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // The temp file may already have been renamed or never created.
    }
    throw error;
  }
}

export function getBridgeAuthPath(homeDir = homedir()): string {
  return join(homeDir, '.fsb', 'bridge-auth.json');
}

export function readBridgeAuthState(path = getBridgeAuthPath()): BridgeAuthState | null {
  try {
    const target = lstatSync(path);
    if (target.isSymbolicLink() || !target.isFile()) return null;
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isBridgeAuthState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function rotateBridgeSessionSecret(
  path = getBridgeAuthPath(),
  now = Date.now(),
): BridgeAuthState {
  const existing = readBridgeAuthState(path);
  const state: BridgeAuthState = {
    version: 1,
    allowedExtensionOrigin: existing?.allowedExtensionOrigin ?? null,
    sessionSecret: randomBytes(32).toString('base64url'),
    sessionId: randomBytes(16).toString('base64url'),
    rotatedAt: now,
  };
  writeBridgeAuthState(path, state);
  return state;
}

export function bindAllowedExtensionOrigin(
  origin: string,
  path = getBridgeAuthPath(),
): BridgeAuthState {
  if (!isExactExtensionOrigin(origin)) {
    throw new Error('Bridge pairing mismatch');
  }
  const state = readBridgeAuthState(path);
  if (!state) {
    throw new Error('Bridge pairing unavailable');
  }
  if (state.allowedExtensionOrigin === origin) return state;
  if (state.allowedExtensionOrigin !== null) {
    throw new Error('Bridge pairing mismatch');
  }

  const boundState: BridgeAuthState = { ...state, allowedExtensionOrigin: origin };
  writeBridgeAuthState(path, boundState);
  return boundState;
}

export function resetBridgePairing(
  path = getBridgeAuthPath(),
  now = Date.now(),
): BridgeAuthState {
  const state: BridgeAuthState = {
    version: 1,
    allowedExtensionOrigin: null,
    sessionSecret: randomBytes(32).toString('base64url'),
    sessionId: randomBytes(16).toString('base64url'),
    rotatedAt: now,
  };
  writeBridgeAuthState(path, state);
  return state;
}

export function authenticateBridgeProtocols(
  protocolHeader: string | string[] | undefined,
  state: BridgeAuthState,
): boolean {
  const values = Array.isArray(protocolHeader) ? protocolHeader : [protocolHeader ?? ''];
  const protocols = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const authCandidates = protocols.filter((value) => value.startsWith(FSB_AUTH_PROTOCOL_PREFIX));
  if (!protocols.includes(FSB_EXT_PROTOCOL) || authCandidates.length !== 1) return false;

  const expected = Buffer.from(formatPairingCode(state), 'utf8');
  const candidate = Buffer.from(authCandidates[0], 'utf8');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function formatPairingCode(state: BridgeAuthState): string {
  return `${FSB_AUTH_PROTOCOL_PREFIX}${state.sessionSecret}`;
}
