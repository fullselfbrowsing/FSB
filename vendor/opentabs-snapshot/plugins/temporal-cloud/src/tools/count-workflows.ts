import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam } from './schemas.js';

export const countWorkflows = defineTool({
  name: 'count_workflows',
  displayName: 'Count Workflows',
  description:
    'Count workflow executions matching an optional visibility query. Useful for getting a quick overview of workflow states without fetching full execution data.',
  summary: 'Count workflows matching a query',
  icon: 'hash',
  group: 'Workflows',
  input: z.object({
    namespace: namespaceParam,
    query: z
      .string()
      .optional()
      .describe('Temporal visibility query filter (e.g., ExecutionStatus="Failed" AND CloseTime > "2024-01-01")'),
  }),
  output: z.object({
    count: z.string().describe('Number of matching workflow executions'),
  }),
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<{ count?: string }>(ns, `/namespaces/${ns}/workflow-count`, {
      query: params.query,
    });
    return { count: data.count ?? '0' };
  },
});
