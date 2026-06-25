import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam, taskQueuePollerSchema, mapPoller, type RawPoller } from './schemas.js';

export const getTaskQueue = defineTool({
  name: 'get_task_queue',
  displayName: 'Get Task Queue',
  description:
    'Get information about a task queue including active pollers (workers), their identities, last access times, build IDs, and rate limits. Useful for debugging worker connectivity issues.',
  summary: 'Get task queue pollers and worker info',
  icon: 'server',
  group: 'Infrastructure',
  input: z.object({
    namespace: namespaceParam,
    task_queue: z.string().describe('Task queue name'),
  }),
  output: z.object({
    pollers: z.array(taskQueuePollerSchema).describe('Active pollers (workers) on this queue'),
    rate_limit_per_second: z.number().describe('Effective rate limit per second (0 = unlimited)'),
    rate_limit_source: z.string().describe('Source of the rate limit (e.g., RATE_LIMIT_SOURCE_SYSTEM)'),
  }),
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<{
      pollers?: RawPoller[];
      effectiveRateLimit?: { requestsPerSecond?: number; rateLimitSource?: string };
    }>(ns, `/namespaces/${ns}/task-queues/${encodeURIComponent(params.task_queue)}`);

    return {
      pollers: (data.pollers ?? []).map(mapPoller),
      rate_limit_per_second: data.effectiveRateLimit?.requestsPerSecond ?? 0,
      rate_limit_source: data.effectiveRateLimit?.rateLimitSource ?? '',
    };
  },
});
