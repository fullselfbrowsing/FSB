export const CLAUDE_CODE_ADAPTER_ID = 'claude-code' as const;
export const OPENCODE_ADAPTER_ID = 'opencode' as const;

export type AgentProviderId =
  | typeof CLAUDE_CODE_ADAPTER_ID
  | typeof OPENCODE_ADAPTER_ID;

export type AdapterAuthState = 'authenticated' | 'unauthenticated' | 'unknown';

export type AdapterDiagnosticCode =
  | 'adapter_unavailable'
  | 'binary_missing'
  | 'binary_changed'
  | 'binary_unsafe'
  | 'version_unparseable'
  | 'version_unsupported'
  | 'agent_protocol_drift'
  | 'tree_unsettled';

export interface AdapterDiagnostic {
  readonly code: AdapterDiagnosticCode;
  readonly message: string;
}

/**
 * One executable identity retained from detection through process creation.
 * `argvPrefix` supports a verified native interpreter/entry-point pair without
 * permitting a shell or a second PATH lookup.
 */
export interface RetainedBinary {
  readonly command: string;
  readonly realPath: string;
  readonly argvPrefix: readonly string[];
}

export interface AdapterDetection {
  readonly installed: boolean;
  readonly version: string | null;
  readonly authState: AdapterAuthState;
  readonly binary: RetainedBinary | null;
  readonly profileVersion: string | null;
  readonly diagnostic?: AdapterDiagnostic;
}

export interface AgentTask {
  readonly text: string;
}

/** Values here are minted or selected by the daemon, never by a wire caller. */
export interface SpawnContext {
  readonly adapterId: AgentProviderId;
  readonly detection: AdapterDetection;
  readonly delegationId: string;
  readonly runtimeFingerprint: string;
  readonly cwd: string;
  readonly privateMcpConfigPath: string;
  readonly runtimeFiles: readonly string[];
}

/** Declarative process data. User task text is intentionally not representable. */
export interface SpawnSpec {
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly privateFiles: readonly string[];
  readonly fixedEnv: Readonly<Record<string, string>>;
}

export type AgentEventType =
  | 'init'
  | 'assistant'
  | 'assistant_delta'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'retry'
  | 'result'
  | 'diagnostic';

export interface AgentEvent {
  readonly type: AgentEventType;
  readonly sessionId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface SupervisedChild {
  readonly pid: number;
  readonly processGroupId: number;
  readonly platform: NodeJS.Platform;
  readonly closed: Promise<ChildExit>;
}

export interface AdapterCapabilities {
  readonly taskMode: boolean;
  readonly chatMode: boolean;
  readonly resume: boolean;
  readonly serverMode: boolean;
}

export const TASK_ONLY_CAPABILITIES: AdapterCapabilities = Object.freeze({
  taskMode: true,
  chatMode: false,
  resume: false,
  serverMode: false,
});

/** Return a fresh deeply frozen spec so mutable caller inputs cannot leak in. */
export function freezeSpawnSpec(spec: SpawnSpec): SpawnSpec {
  return Object.freeze({
    adapterId: spec.adapterId,
    profileVersion: spec.profileVersion,
    command: spec.command,
    argv: Object.freeze([...spec.argv]),
    cwd: spec.cwd,
    privateFiles: Object.freeze([...spec.privateFiles]),
    fixedEnv: Object.freeze({ ...spec.fixedEnv }),
  });
}

export interface AgentProviderAdapter {
  detect(): Promise<AdapterDetection>;
  buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec>;
  parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent>;
  kill(child: SupervisedChild, options: { grace: number }): Promise<void>;
  caps(): AdapterCapabilities;
}
