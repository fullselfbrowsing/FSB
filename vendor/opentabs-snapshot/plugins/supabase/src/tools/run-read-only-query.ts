import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const runReadOnlyQuery = defineTool({
  name: 'run_read_only_query',
  displayName: 'Run Read-Only SQL Query',
  description:
    'Run a read-only SQL query as the supabase_read_only_user role. ' +
    'Safer for SELECT queries — cannot modify data.',
  summary: 'Execute a read-only SQL query',
  icon: 'search',
  group: 'Database',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    query: z.string().min(1).describe('Read-only SQL query (SELECT only)'),
  }),
  output: z.object({
    result: z.array(z.record(z.string(), z.unknown())).describe('Query result rows'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/database/query/read-only`, {
      method: 'POST',
      body: { query: params.query },
    });
    return { result: Array.isArray(data) ? data : [] };
  },
});
