import {
  TASK_ONLY_CAPABILITIES,
  type AdapterCapabilities,
  type AdapterDetection,
  type AgentEvent,
  type AgentProviderAdapter,
  type AgentTask,
  type SpawnContext,
  type SpawnPurpose,
  type SpawnSpec,
  type SupervisedChild,
} from './adapter.js';
import { createGrokBuildDetector } from './grok-detect.js';
import { buildGrokBuildSpawnSpec } from './grok-profile.js';
import {
  createGrokBuildPrivateRuntime,
  type GrokBuildPrivateRuntime,
} from './grok-runtime.js';

export type GrokBuildDetectionDependency = () => Promise<AdapterDetection>;
export type GrokBuildTreeKillDependency = (
  child: SupervisedChild,
  options: { grace: number },
) => Promise<void>;

export interface GrokBuildAdapterDependencies {
  readonly detect?: GrokBuildDetectionDependency;
  readonly runtime?: GrokBuildPrivateRuntime;
  readonly kill: GrokBuildTreeKillDependency;
}

export const GROK_BUILD_CAPABILITIES: AdapterCapabilities = TASK_ONLY_CAPABILITIES;

async function* unsupportedParser(
  _stream: NodeJS.ReadableStream,
  _options?: Readonly<{ purpose: SpawnPurpose }>,
): AsyncIterable<AgentEvent> {
  throw new Error('agent_protocol_drift');
}

export function createGrokBuildAdapter(
  dependencies: GrokBuildAdapterDependencies,
): AgentProviderAdapter {
  if (!dependencies || typeof dependencies.kill !== 'function') {
    throw new TypeError('Grok Build adapter requires a tree-kill dependency');
  }
  const runtime = dependencies.runtime ?? createGrokBuildPrivateRuntime();
  const detect = dependencies.detect ?? createGrokBuildDetector({ runtime }).detect;
  return Object.freeze({
    detect(): Promise<AdapterDetection> {
      return detect();
    },

    async buildSpawn(task: AgentTask, context: SpawnContext): Promise<SpawnSpec> {
      await runtime.attestBase();
      return buildGrokBuildSpawnSpec(task, context, runtime);
    },

    parseEvents(
      stream: NodeJS.ReadableStream,
      options?: Readonly<{ purpose: SpawnPurpose }>,
    ): AsyncIterable<AgentEvent> {
      return unsupportedParser(stream, options);
    },

    kill(child: SupervisedChild, options: { grace: number }): Promise<void> {
      return dependencies.kill(child, options);
    },

    caps(): AdapterCapabilities {
      return GROK_BUILD_CAPABILITIES;
    },
  });
}
