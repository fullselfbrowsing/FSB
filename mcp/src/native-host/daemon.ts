import { isAbsolute, join, normalize } from 'node:path';
import {
  NATIVE_HOST_DAEMON_START_TIMEOUT_MS,
  NATIVE_HOST_HEALTH_MAX_BYTES,
  NATIVE_HOST_HEALTH_PRODUCT,
  NATIVE_HOST_HEALTH_TIMEOUT_MS,
  NATIVE_HOST_PRIVATE_FILE_MODE,
  NATIVE_HOST_PROTOCOL_VERSION,
  NATIVE_HOST_RUNTIME_DIRECTORY_MODE,
  NATIVE_HOST_START_LOCK_STALE_MS,
  NATIVE_HOST_START_POLL_INTERVAL_MS,
} from './constants.js';
import type {
  NativeHostDaemonDependencies,
  NativeHostLockClaimResult,
  NativeHostLockDirectoryIdentity,
  NativeHostRuntimeConfig,
  NativeHostSpawnHandle,
  NativeHostSpawnOptions,
  NativeHostStartLease,
} from './platform.js';

export type NativeHostWakeResult = Readonly<
  | { outcome: 'already_running'; reason: 'daemon_already_ready' }
  | { outcome: 'started'; reason: 'daemon_started_ready' }
  | {
    outcome: 'unavailable';
    reason: 'daemon_identity_mismatch' | 'daemon_protocol_mismatch' | 'runtime_invalid';
  }
  | {
    outcome: 'failed';
    reason: 'wake_lock_timeout' | 'serve_spawn_failed' | 'serve_readiness_timeout' | 'internal_failure';
  }
>;

export type NativeHostHealthClassification =
  | 'offline'
  | 'not_ready'
  | 'ready'
  | 'identity_mismatch'
  | 'protocol_mismatch';

type NativeHostLockMetadata = Readonly<{
  schema: 1;
  token: string;
  createdAt: number;
}>;

type NativeHostLockPaths = Readonly<{
  directory: string;
  metadata: string;
}>;

type NativeHostLockState =
  | Readonly<{ kind: 'owner'; token: string; lease: NativeHostStartLease }>
  | Readonly<{ kind: 'contender' }>
  | Readonly<{ kind: 'health'; health: NativeHostHealthClassification }>
  | Readonly<{ kind: 'failure' }>;

type NativeHostLockPublicationState =
  | Readonly<{ kind: 'owner'; token: string }>
  | Readonly<{ kind: 'contender' }>
  | Readonly<{ kind: 'failure' }>;

const HEALTH_URL = 'http://127.0.0.1:7226/health';
const LOCK_DIRECTORY_NAME = 'wake.lock';
const LOCK_METADATA_NAME = 'owner.json';
const LOCK_METADATA_MAX_BYTES = 256;
const TOKEN_PATTERN = /^[a-f0-9]{32}$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const MAX_PATH_BYTES = 4096;

const ALREADY_RUNNING = Object.freeze({
  outcome: 'already_running',
  reason: 'daemon_already_ready',
} as const);
const STARTED = Object.freeze({
  outcome: 'started',
  reason: 'daemon_started_ready',
} as const);

function unavailable(
  reason: 'daemon_identity_mismatch' | 'daemon_protocol_mismatch' | 'runtime_invalid',
): NativeHostWakeResult {
  return Object.freeze({ outcome: 'unavailable', reason });
}

function failed(
  reason: 'wake_lock_timeout' | 'serve_spawn_failed' | 'serve_readiness_timeout' | 'internal_failure',
): NativeHostWakeResult {
  return Object.freeze({ outcome: 'failed', reason });
}

function boundedPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= MAX_PATH_BYTES
    && !value.includes('\0')
    && !value.includes('\r')
    && !value.includes('\n')
    && isAbsolute(value)
    && normalize(value) === value;
}

function validateRuntime(value: unknown): NativeHostRuntimeConfig | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    const expected = ['stableRuntimeRoot', 'absoluteNode', 'absoluteStableBuildIndex'];
    if (keys.length !== expected.length) return null;
    const fields: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < expected.length; index += 1) {
      if (keys[index] !== expected[index]) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, expected[index]);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return null;
      }
      fields[expected[index]] = descriptor.value;
    }
    if (
      !boundedPath(fields.stableRuntimeRoot)
      || !boundedPath(fields.absoluteNode)
      || !boundedPath(fields.absoluteStableBuildIndex)
      || fields.absoluteStableBuildIndex !== join(
        fields.stableRuntimeRoot,
        'runtime',
        'package',
        'build',
        'index.js',
      )
    ) {
      return null;
    }
    return Object.freeze({
      stableRuntimeRoot: fields.stableRuntimeRoot,
      absoluteNode: fields.absoluteNode,
      absoluteStableBuildIndex: fields.absoluteStableBuildIndex,
    });
  } catch (_error) {
    return null;
  }
}

function exactObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype,
  );
}

function normalizedLockIdentity(value: unknown): NativeHostLockDirectoryIdentity | null {
  if (!exactObject(value)) return null;
  const keys = Reflect.ownKeys(value);
  const expectedKeys = ['directoryId', 'ownerContents', 'roster'];
  if (
    keys.length !== 3
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    fields[key] = descriptor.value;
  }
  const directoryId = fields.directoryId;
  const ownerContents = fields.ownerContents;
  const roster = fields.roster;
  if (
    typeof directoryId !== 'string'
    || directoryId.length < 1
    || Buffer.byteLength(directoryId, 'utf8') > 128
    || /[\0\r\n]/u.test(directoryId)
    || (ownerContents !== null && (
      typeof ownerContents !== 'string'
      || Buffer.byteLength(ownerContents, 'utf8') > LOCK_METADATA_MAX_BYTES
    ))
    || !Array.isArray(roster)
    || roster.length > 64
  ) {
    return null;
  }
  let previous = '';
  const normalizedRoster: string[] = [];
  for (const entry of roster) {
    if (
      typeof entry !== 'string'
      || entry.length < 1
      || Buffer.byteLength(entry, 'utf8') > 512
      || /[\0\r\n]/u.test(entry)
      || (previous && entry <= previous)
    ) {
      return null;
    }
    previous = entry;
    normalizedRoster.push(entry);
  }
  if (Buffer.byteLength(normalizedRoster.join('\0'), 'utf8') > MAX_PATH_BYTES) return null;
  return Object.freeze({
    directoryId,
    ownerContents,
    roster: Object.freeze(normalizedRoster),
  });
}

function lockIdentitiesEqual(
  left: NativeHostLockDirectoryIdentity,
  right: NativeHostLockDirectoryIdentity,
): boolean {
  return left.directoryId === right.directoryId
    && left.ownerContents === right.ownerContents
    && left.roster.length === right.roster.length
    && left.roster.every((entry, index) => entry === right.roster[index]);
}

async function inspectLockIdentity(
  dependencies: NativeHostDaemonDependencies,
  pathname: string,
): Promise<NativeHostLockDirectoryIdentity | null> {
  try {
    return normalizedLockIdentity(await dependencies.inspectLockDirectory(pathname));
  } catch (_error) {
    return null;
  }
}

async function releaseStartLease(lease: NativeHostStartLease): Promise<void> {
  try {
    await lease.release();
  } catch (_error) {
    // The OS releases the listener automatically if this process exits unexpectedly.
  }
}

async function probeHealth(
  dependencies: NativeHostDaemonDependencies,
): Promise<NativeHostHealthClassification> {
  let response;
  try {
    response = await dependencies.requestHealth(Object.freeze({
      url: HEALTH_URL,
      timeoutMs: NATIVE_HOST_HEALTH_TIMEOUT_MS,
      maxBytes: NATIVE_HOST_HEALTH_MAX_BYTES,
    }));
  } catch (_error) {
    return 'offline';
  }
  if (
    !response
    || response.statusCode !== 200
    || !(response.body instanceof Uint8Array)
    || response.body.byteLength < 1
    || response.body.byteLength > NATIVE_HOST_HEALTH_MAX_BYTES
  ) {
    return 'identity_mismatch';
  }
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(response.body);
    value = JSON.parse(text) as unknown;
  } catch (_error) {
    return 'identity_mismatch';
  }
  if (
    !exactObject(value)
    || value.ok !== true
    || value.service !== NATIVE_HOST_HEALTH_PRODUCT
    || typeof value.version !== 'string'
    || Buffer.byteLength(value.version, 'utf8') < 1
    || Buffer.byteLength(value.version, 'utf8') > 64
    || !VERSION_PATTERN.test(value.version)
  ) {
    return 'identity_mismatch';
  }
  if (value.nativeHostProtocol !== NATIVE_HOST_PROTOCOL_VERSION) {
    return 'protocol_mismatch';
  }
  if (typeof value.serveReady !== 'boolean') return 'identity_mismatch';
  return value.serveReady ? 'ready' : 'not_ready';
}

export async function inspectNativeHostDaemonHealth(
  dependencies: NativeHostDaemonDependencies,
): Promise<NativeHostHealthClassification> {
  return probeHealth(dependencies);
}

function parseLockMetadata(value: string | null): NativeHostLockMetadata | null {
  if (!value || Buffer.byteLength(value, 'utf8') > LOCK_METADATA_MAX_BYTES) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!exactObject(parsed)) return null;
    const keys = Reflect.ownKeys(parsed);
    if (
      keys.length !== 3
      || keys[0] !== 'schema'
      || keys[1] !== 'token'
      || keys[2] !== 'createdAt'
      || parsed.schema !== 1
      || typeof parsed.token !== 'string'
      || !TOKEN_PATTERN.test(parsed.token)
      || !Number.isSafeInteger(parsed.createdAt)
      || (parsed.createdAt as number) < 0
    ) {
      return null;
    }
    return Object.freeze({
      schema: 1,
      token: parsed.token,
      createdAt: parsed.createdAt as number,
    });
  } catch (_error) {
    return null;
  }
}

function lockPaths(runtime: NativeHostRuntimeConfig): NativeHostLockPaths {
  const directory = join(runtime.stableRuntimeRoot, LOCK_DIRECTORY_NAME);
  return Object.freeze({
    directory,
    metadata: join(directory, LOCK_METADATA_NAME),
  });
}

function nextToken(dependencies: NativeHostDaemonDependencies): string | null {
  try {
    const token = dependencies.randomToken();
    return TOKEN_PATTERN.test(token) ? token : null;
  } catch (_error) {
    return null;
  }
}

async function writeOwnedLock(
  dependencies: NativeHostDaemonDependencies,
  paths: NativeHostLockPaths,
  token: string,
): Promise<boolean> {
  const createdAt = dependencies.now();
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) return false;
  const metadata: NativeHostLockMetadata = Object.freeze({ schema: 1, token, createdAt });
  try {
    await dependencies.writePrivateFile(
      paths.metadata,
      JSON.stringify(metadata),
      NATIVE_HOST_PRIVATE_FILE_MODE,
    );
    return true;
  } catch (_error) {
    return false;
  }
}

async function cleanupAttemptLock(
  dependencies: NativeHostDaemonDependencies,
  pathname: string,
  token: string,
): Promise<void> {
  try {
    await dependencies.removeAttemptDirectory(pathname, token);
  } catch (_error) {
    // A failed exact-attempt cleanup must not broaden deletion authority.
  }
}

async function publishOwnedLock(
  dependencies: NativeHostDaemonDependencies,
  paths: NativeHostLockPaths,
  token: string,
): Promise<NativeHostLockPublicationState> {
  const attemptDirectory = `${paths.directory}.pending-${token}`;
  const attemptPaths: NativeHostLockPaths = Object.freeze({
    directory: attemptDirectory,
    metadata: join(attemptDirectory, LOCK_METADATA_NAME),
  });
  let created = false;
  try {
    created = await dependencies.createDirectory(
      attemptDirectory,
      NATIVE_HOST_RUNTIME_DIRECTORY_MODE,
    );
    if (!created) return Object.freeze({ kind: 'failure' });
    if (!await writeOwnedLock(dependencies, attemptPaths, token)) {
      await cleanupAttemptLock(dependencies, attemptDirectory, token);
      return Object.freeze({ kind: 'failure' });
    }
    if (await dependencies.renameDirectory(attemptDirectory, paths.directory)) {
      return Object.freeze({ kind: 'owner', token });
    }
    await cleanupAttemptLock(dependencies, attemptDirectory, token);
    return Object.freeze({ kind: 'contender' });
  } catch (_error) {
    if (created) await cleanupAttemptLock(dependencies, attemptDirectory, token);
    return Object.freeze({ kind: 'failure' });
  }
}

async function acquireLock(
  dependencies: NativeHostDaemonDependencies,
  paths: NativeHostLockPaths,
): Promise<NativeHostLockState> {
  const ownerToken = nextToken(dependencies);
  if (!ownerToken) return Object.freeze({ kind: 'failure' });
  const observed = await inspectLockIdentity(dependencies, paths.directory);
  let lease: NativeHostStartLease | null = null;
  try {
    lease = await dependencies.acquireStartLease();
  } catch (_error) {
    return Object.freeze({ kind: 'contender' });
  }
  if (!lease) return Object.freeze({ kind: 'contender' });

  let retainLease = false;
  try {
    const attempted = await publishOwnedLock(dependencies, paths, ownerToken);
    if (attempted.kind === 'owner') {
      retainLease = true;
      return Object.freeze({ kind: 'owner', token: attempted.token, lease });
    }
    if (attempted.kind === 'failure') return Object.freeze({ kind: 'failure' });
    if (!observed) return Object.freeze({ kind: 'contender' });

    const current = await inspectLockIdentity(dependencies, paths.directory);
    if (!current || !lockIdentitiesEqual(observed, current)) {
      return Object.freeze({ kind: 'contender' });
    }
    const existing = parseLockMetadata(current.ownerContents);
    if (existing) {
      const now = dependencies.now();
      if (
        !Number.isSafeInteger(now)
        || now < existing.createdAt
        || now - existing.createdAt < NATIVE_HOST_START_LOCK_STALE_MS
      ) {
        return Object.freeze({ kind: 'contender' });
      }
    }

    const health = await probeHealth(dependencies);
    if (health !== 'offline') return Object.freeze({ kind: 'health', health });
    const quarantineToken = nextToken(dependencies);
    if (!quarantineToken) return Object.freeze({ kind: 'failure' });
    const quarantinePath = `${paths.directory}.quarantine-${quarantineToken}`;
    let claim: NativeHostLockClaimResult;
    try {
      claim = await dependencies.claimLockDirectory(
        paths.directory,
        quarantinePath,
        current,
      );
    } catch (_error) {
      return Object.freeze({ kind: 'contender' });
    }
    if (claim !== 'claimed') return Object.freeze({ kind: 'contender' });
    if (existing) {
      try {
        await dependencies.removeOwnedDirectory(
          quarantinePath,
          'quarantine',
          quarantineToken,
          existing.token,
        );
      } catch (_error) {
        // Unproven quarantine contents stay isolated while canonical recovery continues.
      }
    }
    const replacement = await publishOwnedLock(dependencies, paths, ownerToken);
    if (replacement.kind === 'owner') {
      retainLease = true;
      return Object.freeze({ kind: 'owner', token: replacement.token, lease });
    }
    return replacement;
  } finally {
    if (!retainLease) await releaseStartLease(lease);
  }
}

async function releaseLock(
  dependencies: NativeHostDaemonDependencies,
  paths: NativeHostLockPaths,
  token: string,
): Promise<void> {
  try {
    const identity = await inspectLockIdentity(dependencies, paths.directory);
    if (!identity) return;
    const current = parseLockMetadata(identity.ownerContents);
    if (!current || current.token !== token) return;
    const releasePath = `${paths.directory}.release-${token}`;
    if (await dependencies.claimLockDirectory(
      paths.directory,
      releasePath,
      identity,
    ) !== 'claimed') return;
    await dependencies.removeOwnedDirectory(releasePath, 'release', token, token);
  } catch (_error) {
    // Failure to prove ownership leaves the tokened release quarantine untouched.
  }
}

function sanitizedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(environment)) {
    if (key === 'NODE_OPTIONS' || key === 'NODE_PATH' || typeof value !== 'string') continue;
    result[key] = value;
  }
  return Object.freeze(result);
}

async function awaitSpawn(
  child: NativeHostSpawnHandle,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      child.removeListener('spawn', onSpawn);
      child.removeListener('error', onError);
    };
    const finish = (spawned: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (spawned) {
        try {
          child.unref();
        } catch (_error) {
          resolve(false);
          return;
        }
      }
      resolve(spawned);
    };
    const onSpawn = () => finish(true);
    const onError = () => finish(false);
    try {
      child.once('spawn', onSpawn);
      child.once('error', onError);
    } catch (_error) {
      finish(false);
    }
  });
}

async function spawnServe(
  runtime: NativeHostRuntimeConfig,
  dependencies: NativeHostDaemonDependencies,
): Promise<boolean> {
  const argv = Object.freeze([
    runtime.absoluteStableBuildIndex,
    'serve',
    '--host',
    '127.0.0.1',
    '--port',
    '7226',
  ]);
  const options: NativeHostSpawnOptions = Object.freeze({
    cwd: runtime.stableRuntimeRoot,
    env: sanitizedEnvironment(dependencies.environment),
    shell: false,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    return await awaitSpawn(dependencies.spawn(runtime.absoluteNode, argv, options));
  } catch (_error) {
    return false;
  }
}

async function pollHealth(
  dependencies: NativeHostDaemonDependencies,
  deadline: number,
): Promise<NativeHostHealthClassification | 'timeout' | 'failure'> {
  while (true) {
    const health = await probeHealth(dependencies);
    if (health === 'ready' || health === 'identity_mismatch' || health === 'protocol_mismatch') {
      return health;
    }
    const now = dependencies.now();
    if (!Number.isSafeInteger(now) || now < 0) return 'failure';
    if (now >= deadline) return 'timeout';
    try {
      await dependencies.wait(NATIVE_HOST_START_POLL_INTERVAL_MS);
    } catch (_error) {
      return 'failure';
    }
  }
}

function healthResult(
  health: NativeHostHealthClassification,
): NativeHostWakeResult | null {
  if (health === 'ready') return ALREADY_RUNNING;
  if (health === 'identity_mismatch') return unavailable('daemon_identity_mismatch');
  if (health === 'protocol_mismatch') return unavailable('daemon_protocol_mismatch');
  return null;
}

export async function wakeServeDaemon(options: Readonly<{
  runtime: NativeHostRuntimeConfig;
  dependencies: NativeHostDaemonDependencies;
}>): Promise<NativeHostWakeResult> {
  const runtime = validateRuntime(options?.runtime);
  if (!runtime) return unavailable('runtime_invalid');
  const dependencies = options?.dependencies;
  try {
    const start = dependencies.now();
    if (!Number.isSafeInteger(start) || start < 0) return failed('internal_failure');
    const deadline = start + NATIVE_HOST_DAEMON_START_TIMEOUT_MS;
    if (!Number.isSafeInteger(deadline)) return failed('internal_failure');

    const initialHealth = await probeHealth(dependencies);
    const immediate = healthResult(initialHealth);
    if (immediate) return immediate;
    if (initialHealth === 'not_ready') {
      const observed = await pollHealth(dependencies, deadline);
      const result = observed === 'ready' ? ALREADY_RUNNING : healthResult(observed as NativeHostHealthClassification);
      if (result) return result;
      return observed === 'failure' ? failed('internal_failure') : failed('wake_lock_timeout');
    }

    const paths = lockPaths(runtime);
    const lock = await acquireLock(dependencies, paths);
    if (lock.kind === 'failure') return failed('internal_failure');
    if (lock.kind === 'health') {
      const result = healthResult(lock.health);
      if (result) return result;
      const observed = await pollHealth(dependencies, deadline);
      const polled = observed === 'ready' ? ALREADY_RUNNING : healthResult(observed as NativeHostHealthClassification);
      if (polled) return polled;
      return observed === 'failure' ? failed('internal_failure') : failed('wake_lock_timeout');
    }
    if (lock.kind === 'contender') {
      const observed = await pollHealth(dependencies, deadline);
      const result = observed === 'ready' ? ALREADY_RUNNING : healthResult(observed as NativeHostHealthClassification);
      if (result) return result;
      return observed === 'failure' ? failed('internal_failure') : failed('wake_lock_timeout');
    }

    try {
      if (!await spawnServe(runtime, dependencies)) return failed('serve_spawn_failed');
      const observed = await pollHealth(dependencies, deadline);
      if (observed === 'ready') return STARTED;
      const result = healthResult(observed as NativeHostHealthClassification);
      if (result) return result;
      return observed === 'failure'
        ? failed('internal_failure')
        : failed('serve_readiness_timeout');
    } finally {
      await releaseLock(dependencies, paths, lock.token);
      await releaseStartLease(lock.lease);
    }
  } catch (_error) {
    return failed('internal_failure');
  }
}
