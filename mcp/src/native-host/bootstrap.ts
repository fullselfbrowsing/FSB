import { homedir } from 'node:os';
import { isAbsolute, join, normalize } from 'node:path';
import type { NativeHostDaemonDependencies } from './platform.js';

const AUTH_STATE_MAX_BYTES = 2048;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/u;
const SESSION_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
const AUTH_STATE_KEYS = Object.freeze([
  'allowedExtensionOrigin',
  'rotatedAt',
  'sessionId',
  'sessionSecret',
  'version',
]);

export type NativeBootstrapCredentialResult =
  | Readonly<{ ok: true; pairingCode: string }>
  | Readonly<{
    ok: false;
    reason: 'bridge_session_unavailable' | 'extension_origin_mismatch';
  }>;

function exactAuthState(value: unknown): Readonly<Record<string, unknown>> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (
      keys.length !== AUTH_STATE_KEYS.length
      || keys.some((key, index) => key !== AUTH_STATE_KEYS[index])
    ) {
      return null;
    }
    if (
      record.version !== 1
      || (
        record.allowedExtensionOrigin !== null
        && (
          typeof record.allowedExtensionOrigin !== 'string'
          || !EXTENSION_ORIGIN_PATTERN.test(record.allowedExtensionOrigin)
        )
      )
      || typeof record.sessionSecret !== 'string'
      || !SESSION_SECRET_PATTERN.test(record.sessionSecret)
      || Buffer.from(record.sessionSecret, 'base64url').length !== 32
      || typeof record.sessionId !== 'string'
      || !SESSION_ID_PATTERN.test(record.sessionId)
      || !Number.isSafeInteger(record.rotatedAt)
      || (record.rotatedAt as number) < 0
    ) {
      return null;
    }
    return record;
  } catch (_error) {
    return null;
  }
}

export async function readNativeBootstrapCredential(input: Readonly<{
  origin: string;
  dependencies: NativeHostDaemonDependencies;
}>): Promise<NativeBootstrapCredentialResult> {
  const canonicalOrigin = typeof input.origin === 'string' && input.origin.endsWith('/')
    ? input.origin.slice(0, -1)
    : '';
  if (!EXTENSION_ORIGIN_PATTERN.test(canonicalOrigin)) {
    return Object.freeze({ ok: false, reason: 'extension_origin_mismatch' });
  }

  const configuredHome = input.dependencies.environment.HOME
    ?? input.dependencies.environment.USERPROFILE;
  const homeDirectory = typeof configuredHome === 'string'
    && isAbsolute(configuredHome)
    && normalize(configuredHome) === configuredHome
    ? configuredHome
    : homedir();
  let contents: string | null;
  try {
    contents = await input.dependencies.readPrivateFile(
      join(homeDirectory, '.fsb', 'bridge-auth.json'),
      AUTH_STATE_MAX_BYTES,
    );
  } catch (_error) {
    contents = null;
  }
  if (!contents) {
    return Object.freeze({ ok: false, reason: 'bridge_session_unavailable' });
  }

  let state: Readonly<Record<string, unknown>> | null = null;
  try {
    state = exactAuthState(JSON.parse(contents) as unknown);
  } catch (_error) {
    state = null;
  }
  if (!state) {
    return Object.freeze({ ok: false, reason: 'bridge_session_unavailable' });
  }
  if (
    state.allowedExtensionOrigin !== null
    && state.allowedExtensionOrigin !== canonicalOrigin
  ) {
    return Object.freeze({ ok: false, reason: 'extension_origin_mismatch' });
  }
  return Object.freeze({
    ok: true,
    pairingCode: `fsb-auth.${String(state.sessionSecret)}`,
  });
}
