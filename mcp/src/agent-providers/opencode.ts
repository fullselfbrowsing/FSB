import {
  type AdapterCapabilities,
  type AdapterDetection,
  type AgentEvent,
  type AgentProviderAdapter,
  type AgentTask,
  type SpawnContext,
  type SpawnSpec,
  type SupervisedChild,
} from './adapter.js';
import { createOpenCodeDetector } from './opencode-detect.js';
import {
  buildOpenCodeProfile,
  buildOpenCodeSpawnSpec,
  type OpenCodeProfileRuntime,
} from './opencode-profile.js';
import type { SpawnRuntimeRole, SpawnRuntimeScope } from './adapter.js';
import { parseOpenCodeEvents } from './opencode-stream.js';

export type OpenCodeDetectionDependency = () => Promise<AdapterDetection>;
export type OpenCodeProfileRuntimeDependency = (
  context: SpawnContext,
  role?: SpawnRuntimeRole,
  scope?: SpawnRuntimeScope,
) => OpenCodeProfileRuntime;
export type OpenCodeParserDependency = (
  stream: NodeJS.ReadableStream,
) => AsyncIterable<AgentEvent>;
export type OpenCodeTreeKillDependency = (
  child: SupervisedChild,
  options: { grace: number },
) => Promise<void>;

export interface OpenCodeAdapterDependencies {
  readonly detect?: OpenCodeDetectionDependency;
  readonly resolveProfileRuntime?: OpenCodeProfileRuntimeDependency;
  readonly parseEvents?: OpenCodeParserDependency;
  readonly kill: OpenCodeTreeKillDependency;
}

export const OPENCODE_CAPABILITIES: AdapterCapabilities = Object.freeze({
  taskMode: true,
  chatMode: false,
  resume: false,
  serverMode: true,
});

function unavailableProfileRuntime(): never {
  throw new TypeError('OpenCode profile runtime dependency is unavailable');
}

/**
 * Compose OpenCode policy as declarative adapter output. Runtime ownership and
 * process-tree termination remain injected by the serve-owned supervisor.
 */
export function createOpenCodeAdapter(
  dependencies: OpenCodeAdapterDependencies,
): AgentProviderAdapter {
  if (!dependencies || typeof dependencies.kill !== 'function') {
    throw new TypeError('OpenCode adapter requires a tree-kill dependency');
  }
  if (dependencies.detect !== undefined && typeof dependencies.detect !== 'function') {
    throw new TypeError('OpenCode adapter detection dependency must be callable');
  }
  if (
    dependencies.resolveProfileRuntime !== undefined
    && typeof dependencies.resolveProfileRuntime !== 'function'
  ) {
    throw new TypeError('OpenCode adapter profile runtime dependency must be callable');
  }
  if (dependencies.parseEvents !== undefined && typeof dependencies.parseEvents !== 'function') {
    throw new TypeError('OpenCode adapter parser dependency must be callable');
  }

  const detect = dependencies.detect ?? createOpenCodeDetector().detect;
  const resolveProfileRuntime = dependencies.resolveProfileRuntime ?? unavailableProfileRuntime;
  const parseEvents = dependencies.parseEvents ?? parseOpenCodeEvents;
  const killTree = dependencies.kill;

  return Object.freeze({
    detect(): Promise<AdapterDetection> {
      return detect();
    },

    async buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec> {
      const scopes = ctx.runtimeScopes;
      if (!scopes) {
        return buildOpenCodeSpawnSpec(task, ctx, resolveProfileRuntime(ctx));
      }
      const scopeByRole = new Map(scopes.map((scope) => [scope.role, scope]));
      const delegation = scopeByRole.get('delegation');
      const providerServer = scopeByRole.get('provider_server');
      const policyPreflight = scopeByRole.get('policy_preflight');
      if (!delegation || !providerServer || !policyPreflight) {
        throw new TypeError('OpenCode profile runtime scopes are unavailable');
      }
      const delegationRuntime = resolveProfileRuntime(ctx, 'delegation', delegation);
      return buildOpenCodeProfile(
        task,
        ctx,
        delegationRuntime,
        {
          delegation: delegationRuntime,
          provider_server: resolveProfileRuntime(ctx, 'provider_server', providerServer),
          policy_preflight: resolveProfileRuntime(ctx, 'policy_preflight', policyPreflight),
        },
      ).spawnSpec;
    },

    parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent> {
      return parseEvents(stream);
    },

    kill(child: SupervisedChild, options: { grace: number }): Promise<void> {
      return killTree(child, options);
    },

    caps(): AdapterCapabilities {
      return OPENCODE_CAPABILITIES;
    },
  });
}
