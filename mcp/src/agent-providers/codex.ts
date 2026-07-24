import {
  TASK_ONLY_CAPABILITIES,
  type AdapterCapabilities,
  type AdapterDetection,
  type AgentEvent,
  type AgentProviderAdapter,
  type AgentTask,
  type SpawnContext,
  type SpawnSpec,
  type SupervisedChild,
} from './adapter.js';
import { createCodexDetector } from './codex-detect.js';
import { buildCodexSpawnSpec } from './codex-profile.js';
import { parseCodexStream } from './codex-stream.js';

export type CodexDetectionDependency = () => Promise<AdapterDetection>;
export type CodexParserDependency = (
  stream: NodeJS.ReadableStream,
) => AsyncIterable<AgentEvent>;
export type CodexTreeKillDependency = (
  child: SupervisedChild,
  options: { grace: number },
) => Promise<void>;

export interface CodexAdapterDependencies {
  readonly detect?: CodexDetectionDependency;
  readonly parseEvents?: CodexParserDependency;
  readonly kill: CodexTreeKillDependency;
}

export const CODEX_CAPABILITIES: AdapterCapabilities = TASK_ONLY_CAPABILITIES;

export function createCodexAdapter(
  dependencies: CodexAdapterDependencies,
): AgentProviderAdapter {
  if (!dependencies || typeof dependencies.kill !== 'function') {
    throw new TypeError('Codex adapter requires a tree-kill dependency');
  }
  if (dependencies.detect !== undefined && typeof dependencies.detect !== 'function') {
    throw new TypeError('Codex adapter detection dependency must be callable');
  }
  if (dependencies.parseEvents !== undefined && typeof dependencies.parseEvents !== 'function') {
    throw new TypeError('Codex adapter parser dependency must be callable');
  }
  const detect = dependencies.detect ?? createCodexDetector().detect;
  const parseEvents = dependencies.parseEvents ?? parseCodexStream;
  const killTree = dependencies.kill;

  return Object.freeze({
    detect(): Promise<AdapterDetection> {
      return detect();
    },

    async buildSpawn(task: AgentTask, context: SpawnContext): Promise<SpawnSpec> {
      return buildCodexSpawnSpec(task, context);
    },

    parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent> {
      return parseEvents(stream);
    },

    kill(child: SupervisedChild, options: { grace: number }): Promise<void> {
      return killTree(child, options);
    },

    caps(): AdapterCapabilities {
      return CODEX_CAPABILITIES;
    },
  });
}
