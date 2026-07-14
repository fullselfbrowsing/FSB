import type { BridgeMode, BridgeOptions, BridgeTopologyState, ExtRequestHandler } from '../types.js';
import { WebSocketBridge } from '../bridge.js';
import { startHttpServer } from '../http.js';
import { pushMcpClientInventory } from '../client-inventory.js';
import { TaskQueue } from '../queue.js';
import {
  createProductionSpawnSupervisor,
  type SpawnSupervisor,
  type SpawnSupervisorCloseResult,
} from './spawn-supervisor.js';

export interface ServeDelegationBridge {
  connect(): Promise<void>;
  disconnect(): void;
  readonly currentMode: BridgeMode;
  readonly topology: BridgeTopologyState;
}

export interface ServeDelegationHttpServer {
  readonly endpoint: string;
  readonly healthEndpoint: string;
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
  readonly createSupervisor?: (endpoint: string) => SpawnSupervisor;
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
    createSupervisor: (endpoint) => createProductionSpawnSupervisor({ endpoint }),
    pushInventory: async (bridge) => pushMcpClientInventory(bridge as WebSocketBridge),
    registerSignal: (signal, handler) => process.on(signal, handler),
    exit: (code) => process.exit(code),
  };
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

  const handleExtRequest: ExtRequestHandler = (request, emit) => {
    if (!supervisor) throw new ServeDelegationStartupError();
    return supervisor.handleExtRequest(request, emit);
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
    supervisor = dependencies.createSupervisor(httpServer.endpoint);
    const recovery = await supervisor.recover();
    if (!recovery.spawnAvailable) throw new ServeDelegationStartupError();
    await bridge.connect();
    await dependencies.pushInventory(bridge);
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
      let failed = false;
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
