import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';
import { mapWorker, workerSchema } from './schemas.js';

export const listWorkers = defineTool({
  name: 'list_workers',
  displayName: 'List Workers',
  description:
    'List all Workers scripts in the account. Returns script names, modification dates, usage models, and compatibility dates.',
  summary: 'List Workers scripts',
  icon: 'code',
  group: 'Workers',
  input: z.object({}),
  output: z.object({
    workers: z.array(workerSchema).describe('List of Workers scripts'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation(
        'Could not determine account ID from the current URL. Navigate to an account page first.',
      );
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts`,
    );
    const workers = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return { workers: workers.map(w => mapWorker(w)) };
  },
});
