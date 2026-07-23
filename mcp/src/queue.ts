import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Import read-only tool names from canonical registry (CJS -> ESM bridge)
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolDefs = require(path.resolve(__dirname, '../ai/tool-definitions.cjs'));
const registryReadOnly: string[] = toolDefs.getReadOnlyTools().map((t: { name: string }) => t.name);

// These tools are registry-read-only for schema and registration purposes, but
// their terminal recorder state must be ordered after any pending mutation.
const SERIALIZED_LIFECYCLE_TOOLS = new Set([
  'complete_task',
  'partial_task',
  'fail_task',
]);

// ---------------------------------------------------------------------------
// TaskQueue
// ---------------------------------------------------------------------------

type QueueItem = {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class TaskQueue {
  private queue: QueueItem[] = [];
  private running = false;

  // Derived from tool-definitions.js registry + non-registry read-only tools
  // (observability, agents, etc. registered by agents.ts and observability.ts).
  // Terminal lifecycle tools are deliberately excluded so they serialize.
  private readonly readOnlyTools = new Set([
    ...registryReadOnly.filter(toolName => !SERIALIZED_LIFECYCLE_TOOLS.has(toolName)),
    // Non-registry read-only tools
    'get_task_status',
    'get_site_guides',
    'get_memory',
    'get_extension_config',
    'list_sessions',
    'get_session_detail',
    'get_logs',
    'search_memory',
    'search_capabilities',
    'get_memory_stats',
    'list_agents',
    'get_agent_stats',
    'get_agent_history',
  ]);

  /**
   * Enqueue a tool call. Read-only tools bypass the queue and execute
   * immediately; mutation tools are serialized.
   */
  async enqueue<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    if (this.readOnlyTools.has(toolName)) {
      return fn();
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.process();
    });
  }

  /** Whether a mutation tool is currently executing. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Flush all pending (not yet started) queue items. */
  clear(): void {
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  private async process(): Promise<void> {
    if (this.running || this.queue.length === 0) return;
    this.running = true;

    const item = this.queue.shift()!;
    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.running = false;
      this.process();
    }
  }
}
