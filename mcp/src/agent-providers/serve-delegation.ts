import { randomUUID } from 'node:crypto';
import type { BridgeMode, BridgeOptions, BridgeTopologyState, ExtRequestHandler } from '../types.js';
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
import type { DirectRuntimeReference } from './adapter.js';
import { createDirectRuntimeReference } from './effective-authority.js';

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
  ) => SpawnSupervisor;
  readonly createCompatibilityRegistry?: () => AgentProviderRegistry;
  readonly now?: () => number;
  readonly mintGeneration?: () => string;
  readonly prepareBridgeAuth?: () => void | Promise<void>;
  readonly pushInventory?: (bridge: ServeDelegationBridge) => Promise<void>;
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
const MAX_COMPATIBILITY_ADAPTERS = 16;

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
    createSupervisor: (endpoint, onDegraded, directRuntimeReference) => createProductionSpawnSupervisor({
      endpoint,
      onDegraded,
      directRuntimeReference,
    }),
    createCompatibilityRegistry: () => createProductionAdapterRegistry({
      kill: async () => {
        throw new Error('Compatibility registry has no process-termination authority');
      },
    }),
    now: () => Date.now(),
    mintGeneration: () => randomUUID(),
    prepareBridgeAuth: () => undefined,
    pushInventory: async (bridge) => pushMcpClientInventory(bridge as WebSocketBridge),
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
    rows.push(classifyAdapterCompatibility(
      contract.adapterId,
      compatibilityEvidence(detection),
    ));
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

  const handleExtRequest: ExtRequestHandler = async (request, emit, context) => {
    if (!supervisor) throw new ServeDelegationStartupError();
    if (request.method === 'adapter.compatibility') {
      if (!isExactEmptyPayload(request.payload)) {
        throw new TypeError('Invalid adapter compatibility request');
      }
      compatibilityRegistry ??= dependencies.createCompatibilityRegistry();
      const snapshot = await collectCompatibilitySnapshot(
        compatibilityRegistry,
        dependencies.now(),
      );
      return snapshot as unknown as Record<string, unknown>;
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
    }, directRuntimeReference);
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
      dependencies.exit(exitCode);
      if (failed) throw new ServeDelegationShutdownError();
      return Object.freeze({ supervisor: supervisorResult, exitCode });
    })();
    return shutdownPromise;
  };

  requestDegradedShutdown = () => {
    void shutdown().catch(() => undefined);
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
