import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listQueues = defineTool({
  name: 'list_queues',
  displayName: 'List Queues',
  description: 'List Cloudflare Queues in the account. Queues provide reliable message delivery between Workers.',
  summary: 'List Cloudflare Queues',
  icon: 'list-ordered',
  group: 'Storage',
  input: z.object({}),
  output: z.object({
    queues: z
      .array(
        z.object({
          queue_id: z.string().describe('Queue ID'),
          queue_name: z.string().describe('Queue name'),
          created_on: z.string().describe('ISO 8601 creation timestamp'),
          modified_on: z.string().describe('ISO 8601 last modification timestamp'),
        }),
      )
      .describe('List of queues'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(`/accounts/${encodeURIComponent(accountId)}/queues`);
    const queues = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      queues: queues.map(q => ({
        queue_id: (q.queue_id as string) ?? '',
        queue_name: (q.queue_name as string) ?? '',
        created_on: (q.created_on as string) ?? '',
        modified_on: (q.modified_on as string) ?? '',
      })),
    };
  },
});
