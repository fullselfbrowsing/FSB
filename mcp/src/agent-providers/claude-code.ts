import {
  TASK_ONLY_CAPABILITIES,
  type AdapterDetection,
  type AgentEvent,
  type AgentProviderAdapter,
  type AgentTask,
  type AdapterCapabilities,
  type SpawnContext,
  type SpawnSpec,
  type SupervisedChild,
} from './adapter.js';
import { createClaudeCodeDetector } from './claude-detect.js';
import { buildClaudeSpawnSpec } from './claude-profile.js';
import { parseClaudeEvents } from './claude-stream.js';

export type ClaudeDetectionDependency = () => Promise<AdapterDetection>;
export type ClaudeParserDependency = (
  stream: NodeJS.ReadableStream,
) => AsyncIterable<AgentEvent>;
export type ClaudeTreeKillDependency = (
  child: SupervisedChild,
  options: { grace: number },
) => Promise<void>;

export interface ClaudeCodeAdapterDependencies {
  readonly detect?: ClaudeDetectionDependency;
  readonly parseEvents?: ClaudeParserDependency;
  readonly kill: ClaudeTreeKillDependency;
}

/**
 * Compose the provider-specific policy boundary without acquiring process or
 * filesystem authority. The serve-owned supervisor supplies tree cleanup and
 * remains the only code allowed to create a child process.
 */
export function createClaudeCodeAdapter(
  dependencies: ClaudeCodeAdapterDependencies,
): AgentProviderAdapter {
  if (!dependencies || typeof dependencies.kill !== 'function') {
    throw new TypeError('Claude adapter requires a tree-kill dependency');
  }
  if (dependencies.detect !== undefined && typeof dependencies.detect !== 'function') {
    throw new TypeError('Claude adapter detection dependency must be callable');
  }
  if (dependencies.parseEvents !== undefined && typeof dependencies.parseEvents !== 'function') {
    throw new TypeError('Claude adapter parser dependency must be callable');
  }

  const detect = dependencies.detect ?? createClaudeCodeDetector().detect;
  const parseEvents = dependencies.parseEvents ?? parseClaudeEvents;
  const killTree = dependencies.kill;

  return Object.freeze({
    detect(): Promise<AdapterDetection> {
      return detect();
    },

    async buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec> {
      return buildClaudeSpawnSpec(task, ctx);
    },

    parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent> {
      return parseEvents(stream);
    },

    kill(child: SupervisedChild, options: { grace: number }): Promise<void> {
      return killTree(child, options);
    },

    caps(): AdapterCapabilities {
      return TASK_ONLY_CAPABILITIES;
    },
  });
}
