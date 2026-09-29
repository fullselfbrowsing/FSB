import { randomUUID } from 'node:crypto';
import type {
  BridgeMode,
  BridgeOptions,
  BridgeTopologyState,
  ExtEvent,
  ExtRequestHandler,
} from '../types.js';
import { WebSocketBridge } from '../bridge.js';
import { startHttpServer } from '../http.js';
import { pushMcpClientInventory } from '../client-inventory.js';
import { TaskQueue } from '../queue.js';
import {
  ADAPTER_COMPATIBILITY_MATRIX,
  classifyAdapterCompatibility,
  createSafeCompatibilitySnapshot,
  type AdapterCompatibilityEvidence,
  type SafeCompatibilitySnapshot,
} from './compatibility.js';
import {
  createProductionAdapterRegistry,
  type AgentProviderRegistry,
} from './registry.js';
import {
  createProductionSpawnSupervisor,
  type SpawnSupervisor,
  type SpawnSupervisorCloseResult,
} from './spawn-supervisor.js';
import type { AdapterAuthState, DirectRuntimeReference } from './adapter.js';
import { GROK_BUILD_ADAPTER_ID } from './adapter.js';
import { createDirectRuntimeReference } from './effective-authority.js';
import {
  testAgentProviderConnection,
  type AgentConnectionTestResult,
} from './connection-test.js';
import type { AgentProviderId } from './adapter.js';
import {
  createGrokBuildAuthCoordinator,
  type GrokBuildAuthCoordinator,
  type GrokBuildAuthProgress,
} from './grok-auth.js';
import {
  createGrokBuildPrivateRuntime,
  GROK_BUILD_PROFILE_VERSION,
  type GrokBuildPrivateRuntime,
} from './grok-runtime.js';
import { logDelegationEvent } from './delegation-log.js';

const GROK_LOGIN_SENSITIVE_QUERY_KEY =
  /(?:token|secret|password|credential|api[_-]?key|authorization)/i;

export interface ServeDelegationBridge {
  connect(): Promise<void>;
  disconnect(): void;
  readonly currentMode: BridgeMode;
  readonly topology: BridgeTopologyState;
}

export interface ServeDelegationHttpServer {
  readonly endpoint: string;
  readonly healthEndpoint: string;
  markServeReady(): void;
  close(): Promise<void>;
}

export interface ServeDelegationShutdownResult {
  readonly supervisor: SpawnSupervisorCloseResult;
  readonly exitCode: 0 | 1;
}

export interface RunningServeDelegation {
  readonly bridge: ServeDelegationBridge;
  readonly httpServer: ServeDelegationHttpServer;
  readonly supervisor: SpawnSupervisor;
  readonly endpoint: string;
  readonly healthEndpoint: string;
  shutdown(): Promise<ServeDelegationShutdownResult>;
}

export interface ServeDelegationDependencies {
  readonly createBridge?: (options: BridgeOptions) => ServeDelegationBridge;
  readonly createQueue?: () => unknown;
  readonly startHttp?: (options: {
    host: string;
    port: number;
    bridge: ServeDelegationBridge;
    queue: unknown;
  }) => Promise<ServeDelegationHttpServer>;
  readonly createSupervisor?: (
    endpoint: string,
    onDegraded: (code: 'tree_unsettled' | 'runtime_cleanup_failed') => void,
    directRuntimeReference: DirectRuntimeReference,
    grokBuildAuthCoordinator: GrokBuildAuthCoordinator,
    grokBuildRuntime: GrokBuildPrivateRuntime,
  ) => SpawnSupervisor;
  readonly createCompatibilityRegistry?: (
    grokBuildRuntime: GrokBuildPrivateRuntime,
  ) => AgentProviderRegistry;
  readonly createGrokBuildRuntime?: () => GrokBuildPrivateRuntime;
  readonly createGrokBuildAuthCoordinator?: (
    runtime: GrokBuildPrivateRuntime,
  ) => GrokBuildAuthCoordinator;
  readonly runConnectionTest?: (input: Readonly<{
    providerId: AgentProviderId;
    registry: AgentProviderRegistry;
    signal?: AbortSignal;
  }>) => Promise<AgentConnectionTestResult>;
  readonly now?: () => number;
  readonly mintGeneration?: () => string;
  readonly prepareBridgeAuth?: () => void | Promise<void>;
  readonly pushInventory?: (bridge: ServeDelegationBridge) => Promise<void>;
  readonly scheduleDegradedShutdown?: (run: () => void) => void;
  readonly registerSignal?: (
    signal: 'SIGTERM' | 'SIGINT',
    handler: () => void,
  ) => void;
  readonly exit?: (code: 0 | 1) => void;
}

export interface StartServeDelegationOptions {
  readonly host: string;
  readonly port: number;
  readonly dependencies?: ServeDelegationDependencies;
}

export class ServeDelegationStartupError extends Error {
  readonly code = 'agent_recovery_unavailable' as const;

  constructor() {
    super('Serve delegation startup is unavailable');
    this.name = 'ServeDelegationStartupError';
  }
}

export class ServeDelegationShutdownError extends Error {
  readonly code = 'tree_unsettled' as const;

  constructor() {
    super('Serve delegation shutdown did not settle cleanly');
    this.name = 'ServeDelegationShutdownError';
  }
}

const EMPTY_CLOSE_RESULT: SpawnSupervisorCloseResult = Object.freeze({
  cancelled: 0,
  failed: 0,
  alreadySettled: 0,
});
// Mirrors GrokBuildAuthBeginReason in grok-auth.ts. Kept as a literal list so the
// wire shape is validated here rather than trusted from the coordinator.
const GROK_AUTH_BEGIN_REASONS: readonly string[] = Object.freeze([
  'none',
  'cancelled',
  'login_failed',
  'version_unsupported',
  'sandbox_unavailable',
  'adapter_unavailable',
  'provider_auth_locked',
  'session_cleanup_blocked',
]);
const MAX_COMPATIBILITY_ADAPTERS = 16;
const DEGRADED_SHUTDOWN_FLUSH_MS = 250;

function defaultDependencies(): Required<ServeDelegationDependencies> {
  return {
    createBridge: (options) => new WebSocketBridge(options),
    createQueue: () => new TaskQueue(),
    startHttp: async (options) => startHttpServer({
      host: options.host,
      port: options.port,
      bridge: options.bridge as WebSocketBridge,
      queue: options.queue as TaskQueue,
    }),
    createSupervisor: (
      endpoint,
      onDegraded,
      directRuntimeReference,
      grokBuildAuthCoordinator,
      grokBuildRuntime,
    ) => createProductionSpawnSupervisor({
      endpoint,
      onDegraded,
      directRuntimeReference,
      grokBuildAuthCoordinator,
      grokBuildRuntime,
    }),
    createCompatibilityRegistry: (grokBuildRuntime) => createProductionAdapterRegistry({
      grokBuildRuntime,
      kill: async () => {
        throw new Error('Compatibility registry has no process-termination authority');
      },
    }),
    createGrokBuildRuntime: () => createGrokBuildPrivateRuntime(),
    createGrokBuildAuthCoordinator: (runtime) => createGrokBuildAuthCoordinator({ runtime }),
    runConnectionTest: testAgentProviderConnection,
    now: () => Date.now(),
    mintGeneration: () => randomUUID(),
    prepareBridgeAuth: () => undefined,
    pushInventory: async (bridge) => pushMcpClientInventory(bridge as WebSocketBridge),
    // A degraded latch fires while the failing run is still resolving its ext
    // response. Exiting in the same tick strands the extension on a 47-minute
    // timeout, so the shutdown yields long enough for that reply to flush.
    scheduleDegradedShutdown: (run) => { setTimeout(run, DEGRADED_SHUTDOWN_FLUSH_MS).unref?.(); },
    registerSignal: (signal, handler) => process.on(signal, handler),
    exit: (code) => process.exit(code),
  };
}

function isExactEmptyPayload(value: unknown): value is Record<string, never> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === 0;
}

function exactConnectionTestProviderId(value: unknown): AgentProviderId | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== 1
  ) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'providerId');
  if (
    !descriptor
    || descriptor.enumerable !== true
    || !Object.hasOwn(descriptor, 'value')
    || (
      descriptor.value !== 'claude-code'
      && descriptor.value !== GROK_BUILD_ADAPTER_ID
    )
  ) {
    return null;
  }
  return descriptor.value;
}

function ownDataValue(record: object, key: string): unknown | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && descriptor.enumerable && 'value' in descriptor
    ? descriptor.value
    : undefined;
}

function ownCallable(record: unknown, key: string): ((...args: unknown[]) => unknown) | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (Object.getPrototypeOf(record) !== Object.prototype) return null;
  const value = ownDataValue(record, key);
  return typeof value === 'function' ? value as (...args: unknown[]) => unknown : null;
}

function denseAdapterIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (!Number.isSafeInteger(value.length) || value.length > 16) return null;
  if (Reflect.ownKeys(value).length !== value.length + 1) return null;

  const ids: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor
      || !descriptor.enumerable
      || !('value' in descriptor)
      || typeof descriptor.value !== 'string'
      || descriptor.value.length === 0
      || descriptor.value.length > 64
    ) return null;
    ids.push(descriptor.value);
  }
  return Object.freeze(ids);
}

function denseRetainedPrefix(value: unknown): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (!Number.isSafeInteger(value.length) || value.length > 8) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor
      || !descriptor.enumerable
      || !('value' in descriptor)
      || typeof descriptor.value !== 'string'
      || descriptor.value.length > 4_096
    ) return false;
  }
  return true;
}

function isRetainedBinary(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== 'string')
    || JSON.stringify([...keys].sort()) !== JSON.stringify(['argvPrefix', 'command', 'realPath'])
  ) {
    return false;
  }
  const command = ownDataValue(value, 'command');
  const realPath = ownDataValue(value, 'realPath');
  const argvPrefix = ownDataValue(value, 'argvPrefix');
  return typeof command === 'string'
    && command.length > 0
    && command.length <= 4_096
    && typeof realPath === 'string'
    && realPath.length > 0
    && realPath.length <= 4_096
    && denseRetainedPrefix(argvPrefix);
}

function safeDiagnosticCode(detection: object): string | null {
  const value = ownDataValue(detection, 'diagnostic');
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const code = ownDataValue(value, 'code');
  return typeof code === 'string' ? code : null;
}

function compatibilityEvidence(detection: unknown): AdapterCompatibilityEvidence {
  if (!detection || typeof detection !== 'object' || Array.isArray(detection)) {
    return Object.freeze({ binaryFound: false, version: null });
  }
  if (Object.getPrototypeOf(detection) !== Object.prototype) {
    return Object.freeze({ binaryFound: false, version: null });
  }
  const binary = ownDataValue(detection, 'binary');
  const rawVersion = ownDataValue(detection, 'version');
  if (!(rawVersion === null || typeof rawVersion === 'string')) {
    return Object.freeze({ binaryFound: false, version: null });
  }
  const version = rawVersion === null && safeDiagnosticCode(detection) === 'version_unparseable'
    ? 'malformed'
    : rawVersion;
  return Object.freeze({
    binaryFound: isRetainedBinary(binary),
    version,
  });
}

function safeAuthState(detection: unknown): AdapterAuthState {
  if (!detection || typeof detection !== 'object' || Array.isArray(detection)) return 'unknown';
  if (Object.getPrototypeOf(detection) !== Object.prototype) return 'unknown';
  const authState = ownDataValue(detection, 'authState');
  return authState === 'oauth'
    || authState === 'unauthenticated'
    || authState === 'unknown'
    ? authState
    : 'unknown';
}

async function collectCompatibilitySnapshot(
  registry: AgentProviderRegistry,
  checkedAt: number,
): Promise<SafeCompatibilitySnapshot> {
  const contracts = ADAPTER_COMPATIBILITY_MATRIX.adapters;
  if (contracts.length === 0 || contracts.length > MAX_COMPATIBILITY_ADAPTERS) {
    throw new TypeError('Adapter compatibility roster is invalid');
  }
  const idsMethod = ownCallable(registry, 'ids');
  const requireMethod = ownCallable(registry, 'require');
  let registryIds: readonly string[] | null = null;
  if (idsMethod) {
    try {
      registryIds = denseAdapterIds(idsMethod.call(registry));
    } catch {
      registryIds = null;
    }
  }
  const exactRoster = registryIds !== null
    && registryIds.length === contracts.length
    && registryIds.every((adapterId, index) => adapterId === contracts[index]?.adapterId);
  if (!exactRoster || !requireMethod) {
    return createSafeCompatibilitySnapshot(
      checkedAt,
      contracts.map((contract) => Object.freeze({
        adapterId: contract.adapterId,
        displayLabel: contract.displayLabel,
        status: 'unsupported' as const,
        reason: 'matrix_invalid' as const,
        authState: 'unknown' as const,
      })),
    );
  }

  const rows = [];
  for (const contract of contracts) {
    let detection: unknown = null;
    try {
      const adapter = requireMethod.call(registry, contract.adapterId);
      const detectMethod = ownCallable(adapter, 'detect');
      if (detectMethod) detection = await detectMethod.call(adapter);
    } catch {
      // Detection failure is a closed unsupported fact, never response detail.
    }
    let evidence: AdapterCompatibilityEvidence = Object.freeze({
      binaryFound: false,
      version: null,
    });
    let authState: AdapterAuthState = 'unknown';
    try {
      evidence = compatibilityEvidence(detection);
      authState = safeAuthState(detection);
    } catch {
      // Hostile detector objects fail closed before the safe projection.
    }
    const classified = classifyAdapterCompatibility(contract.adapterId, evidence);
    rows.push(Object.freeze({
      ...classified,
      authState: classified.status === 'unsupported' ? 'unknown' : authState,
    }));
  }
  return createSafeCompatibilitySnapshot(checkedAt, rows);
}

async function closeStartupResources(
  supervisor: SpawnSupervisor | null,
  httpServer: ServeDelegationHttpServer | null,
  bridge: ServeDelegationBridge,
): Promise<void> {
  if (supervisor) await supervisor.close().catch(() => undefined);
  if (httpServer) await httpServer.close().catch(() => undefined);
  try {
    bridge.disconnect();
  } catch {
    // Startup is already failing; keep cleanup best-effort and content-free.
  }
}

export async function startServeDelegation(
  options: StartServeDelegationOptions,
): Promise<RunningServeDelegation> {
  const dependencies = { ...defaultDependencies(), ...options.dependencies };
  let supervisor: SpawnSupervisor | null = null;
  let httpServer: ServeDelegationHttpServer | null = null;
  let compatibilityRegistry: AgentProviderRegistry | null = null;
  let degraded = false;
  let requestDegradedShutdown: (() => void) | null = null;
  const grokBuildRuntime = dependencies.createGrokBuildRuntime();
  const grokBuildAuthCoordinator = dependencies.createGrokBuildAuthCoordinator(
    grokBuildRuntime,
  );

  const exactGrokAuthProvider = (value: unknown): boolean => (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === 1
    && ownDataValue(value, 'providerId') === GROK_BUILD_ADAPTER_ID
  );

  const grokAuthStateOnly = (value: unknown): Readonly<{ state: AdapterAuthState }> => {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== 1
    ) throw new TypeError('Invalid provider auth result');
    const state = ownDataValue(value, 'state');
    if (state !== 'oauth' && state !== 'unauthenticated' && state !== 'unknown') {
      throw new TypeError('Invalid provider auth result');
    }
    return Object.freeze({ state });
  };

  // Logout answers with one of exactly two shapes: the settled state, or the
  // locked marker the panel turns into "a task is active". A handler throw
  // cannot carry that distinction -- the bridge rewrites every one of them to a
  // single opaque code -- so the refusal rides the payload instead.
  const grokAuthBeginResult = (value: unknown): Readonly<Record<string, unknown>> => {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== 2
    ) throw new TypeError('Invalid provider auth result');
    const state = ownDataValue(value, 'state');
    const reason = ownDataValue(value, 'reason');
    if (state !== 'oauth' && state !== 'unauthenticated' && state !== 'unknown') {
      throw new TypeError('Invalid provider auth result');
    }
    if (!GROK_AUTH_BEGIN_REASONS.includes(typeof reason === 'string' ? reason : '')) {
      throw new TypeError('Invalid provider auth result');
    }
    return Object.freeze({ state, reason });
  };

  const grokLogoutResult = (value: unknown): Readonly<Record<string, unknown>> => {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) throw new TypeError('Invalid provider auth result');
    const keys = Reflect.ownKeys(value);
    const state = ownDataValue(value, 'state');
    if (keys.length === 1 && state === 'unauthenticated') {
      return Object.freeze({ state });
    }
    if (
      keys.length === 2
      && state === 'unknown'
      && ownDataValue(value, 'locked') === true
    ) {
      return Object.freeze({ state, locked: true });
    }
    throw new TypeError('Invalid provider auth result');
  };

  const canonicalGrokLoginUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return null;
    try {
      const parsed = new URL(value);
      if (
        parsed.hash !== ''
        || [...parsed.searchParams.keys()].some((key) => (
          GROK_LOGIN_SENSITIVE_QUERY_KEY.test(key)
        ))
      ) return null;
      return parsed.protocol === 'https:'
        && parsed.username === ''
        && parsed.password === ''
        && ['auth.x.ai', 'accounts.x.ai', 'grok.com', 'auth.grok.com']
          .includes(parsed.hostname.toLowerCase())
        ? parsed.toString()
        : null;
    } catch {
      return null;
    }
  };

  const emitAuthProgress = (
    requestId: string,
    emit: (event: ExtEvent) => void,
    progress: GrokBuildAuthProgress,
  ): void => {
    if (
      progress === null
      || typeof progress !== 'object'
      || Array.isArray(progress)
      || Object.getPrototypeOf(progress) !== Object.prototype
    ) throw new TypeError('Invalid provider auth progress');
    const keys = Reflect.ownKeys(progress);
    const state = ownDataValue(progress, 'state');
    if (
      !['opening_browser', 'waiting', 'authenticated', 'failed', 'cancelled'].includes(
        typeof state === 'string' ? state : '',
      )
    ) throw new TypeError('Invalid provider auth progress');
    const rawUrl = keys.length === 2 && keys.includes('state') && keys.includes('url')
      ? ownDataValue(progress, 'url')
      : null;
    if (keys.length !== (rawUrl === null ? 1 : 2) || !keys.includes('state')) {
      throw new TypeError('Invalid provider auth progress');
    }
    const url = rawUrl === null ? null : canonicalGrokLoginUrl(rawUrl);
    if (rawUrl !== null && (state !== 'waiting' || !url)) {
      throw new TypeError('Invalid provider auth progress');
    }
    emit({
      id: requestId,
      type: 'ext:event',
      event: 'provider.auth.progress',
      payload: Object.freeze({
        providerId: GROK_BUILD_ADAPTER_ID,
        state,
        ...(url ? { url } : {}),
      }),
    });
  };

  // Defined outside handleExtRequest on purpose: the reverse-channel contract
  // forbids the literal `profileVersion` anywhere in the ext-request region, to
  // keep the compatibility branch from projecting it to the client. This only
  // writes to the local journal -- nothing here reaches the response.
  const logGrokAuthSettled = (settled: Readonly<Record<string, unknown>>): void => {
    logDelegationEvent({
      event: 'auth_settled',
      adapterId: GROK_BUILD_ADAPTER_ID,
      profileVersion: GROK_BUILD_PROFILE_VERSION,
      status: typeof settled.state === 'string' ? settled.state : undefined,
      code: typeof settled.reason === 'string' ? settled.reason : undefined,
    });
  };

  const handleExtRequest: ExtRequestHandler = async (request, emit, context) => {
    if (!supervisor) throw new ServeDelegationStartupError();
    if (request.method === 'adapter.compatibility') {
      if (!isExactEmptyPayload(request.payload)) {
        throw new TypeError('Invalid adapter compatibility request');
      }
      compatibilityRegistry ??= dependencies.createCompatibilityRegistry(grokBuildRuntime);
      const snapshot = await collectCompatibilitySnapshot(
        compatibilityRegistry,
        dependencies.now(),
      );
      return snapshot as unknown as Record<string, unknown>;
    }
    if (request.method === 'provider.test-connection') {
      const providerId = exactConnectionTestProviderId(request.payload);
      if (!providerId) throw new TypeError('Invalid provider connection test request');
      compatibilityRegistry ??= dependencies.createCompatibilityRegistry(grokBuildRuntime);
      const result = await dependencies.runConnectionTest({
        providerId,
        registry: compatibilityRegistry,
        ...(context?.signal ? { signal: context.signal } : {}),
      });
      return result as unknown as Record<string, unknown>;
    }
    if (request.method === 'provider.auth.status') {
      if (!exactGrokAuthProvider(request.payload)) {
        throw new TypeError('Invalid provider auth status request');
      }
      return grokAuthStateOnly(await grokBuildAuthCoordinator.status());
    }
    if (request.method === 'provider.auth.begin') {
      if (!exactGrokAuthProvider(request.payload)) {
        throw new TypeError('Invalid provider auth begin request');
      }
      const beginResult = grokAuthBeginResult(await grokBuildAuthCoordinator.begin(
        (progress) => emitAuthProgress(request.id, emit, progress),
        context?.signal,
      ));
      logGrokAuthSettled(beginResult);
      return beginResult;
    }
    if (request.method === 'provider.auth.logout') {
      if (!exactGrokAuthProvider(request.payload)) {
        throw new TypeError('Invalid provider auth logout request');
      }
      return grokLogoutResult(await grokBuildAuthCoordinator.logout());
    }
    return supervisor.handleExtRequest(request, emit, context);
  };
  const bridge = dependencies.createBridge({
    capabilities: ['agent-spawn'],
    handleExtRequest,
  });
  const queue = dependencies.createQueue();

  try {
    httpServer = await dependencies.startHttp({
      host: options.host,
      port: options.port,
      bridge,
      queue,
    });
    const directRuntimeReference = createDirectRuntimeReference(
      httpServer.endpoint,
      dependencies.mintGeneration(),
    );
    supervisor = dependencies.createSupervisor(httpServer.endpoint, () => {
      degraded = true;
      requestDegradedShutdown?.();
    }, directRuntimeReference, grokBuildAuthCoordinator, grokBuildRuntime);
    const recovery = await supervisor.recover();
    if (!recovery.spawnAvailable) throw new ServeDelegationStartupError();
    await dependencies.prepareBridgeAuth();
    await bridge.connect();
    await dependencies.pushInventory(bridge);
    httpServer.markServeReady();
  } catch {
    await closeStartupResources(supervisor, httpServer, bridge);
    throw new ServeDelegationStartupError();
  }

  const readySupervisor = supervisor;
  const readyHttpServer = httpServer;
  let shutdownPromise: Promise<ServeDelegationShutdownResult> | null = null;
  const shutdown = (): Promise<ServeDelegationShutdownResult> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      let failed = degraded;
      let supervisorResult = EMPTY_CLOSE_RESULT;
      try {
        supervisorResult = await readySupervisor.close();
        if (supervisorResult.failed > 0) failed = true;
      } catch {
        failed = true;
      }
      try {
        await readyHttpServer.close();
      } catch {
        failed = true;
      }
      try {
        bridge.disconnect();
      } catch {
        failed = true;
      }
      const exitCode = failed ? 1 : 0;
      // Written before exit so a degraded shutdown leaves a reason behind; the
      // daemon runs with stdio ignored, so this file is its only voice.
      logDelegationEvent({ event: 'daemon_shutdown', exitCode, degraded });
      dependencies.exit(exitCode);
      if (failed) throw new ServeDelegationShutdownError();
      return Object.freeze({ supervisor: supervisorResult, exitCode });
    })();
    return shutdownPromise;
  };

  requestDegradedShutdown = () => {
    dependencies.scheduleDegradedShutdown(() => {
      void shutdown().catch(() => undefined);
    });
  };
  if (degraded) requestDegradedShutdown();

  dependencies.registerSignal('SIGTERM', () => { void shutdown().catch(() => undefined); });
  dependencies.registerSignal('SIGINT', () => { void shutdown().catch(() => undefined); });

  return Object.freeze({
    bridge,
    httpServer: readyHttpServer,
    supervisor: readySupervisor,
    endpoint: readyHttpServer.endpoint,
    healthEndpoint: readyHttpServer.healthEndpoint,
    shutdown,
  });
}
