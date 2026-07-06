import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const runQuery = defineTool({
  name: 'run_query',
  displayName: 'Run SQL Query',
  description:
    'Run a SQL query against a Supabase project database. Returns the query results as rows. ' +
    'Use this for DDL (CREATE, ALTER, DROP), DML (INSERT, UPDATE, DELETE), and DQL (SELECT) operations.',
  summary: 'Execute a SQL query on a project database',
  icon: 'terminal',
  group: 'Database',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    query: z.string().min(1).describe('SQL query to execute'),
  }),
  output: z.object({
    result: z.array(z.record(z.string(), z.unknown())).describe('Query result rows'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/database/query`, {
      method: 'POST',
      body: { query: params.query },
    });
    return { result: Array.isArray(data) ? data : [] };
  },
});
