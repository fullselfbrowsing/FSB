import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

const LOG_TABLE_MAP: Record<string, string> = {
  postgres: 'postgres_logs',
  auth: 'auth_logs',
  realtime: 'realtime_logs',
  storage: 'storage_logs',
  'edge-functions': 'edge_logs',
  postgrest: 'postgrest_logs',
};

export const getProjectLogs = defineTool({
  name: 'get_project_logs',
  displayName: 'Get Project Logs',
  description:
    'Fetch recent logs from a Supabase project. Supports filtering by log source ' +
    '(e.g., "postgres", "auth", "storage", "realtime", "edge-functions", "postgrest").',
  summary: 'Fetch project logs by source',
  icon: 'scroll-text',
  group: 'Analytics',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    source: z
      .string()
      .describe('Log source to query: "postgres", "auth", "storage", "realtime", "edge-functions", or "postgrest"'),
  }),
  output: z.object({
    logs: z.array(z.record(z.string(), z.unknown())).describe('Log entries'),
  }),
  handle: async params => {
    const table = LOG_TABLE_MAP[params.source] ?? `${params.source}_logs`;
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 3600_000).toISOString();
    const sql = `select id, timestamp, event_message from ${table} order by timestamp desc limit 100`;

    const data = await api<{ result?: Record<string, unknown>[]; error?: string }>(
      `/projects/${params.ref}/analytics/endpoints/logs.all`,
      {
        query: {
          iso_timestamp_start: start,
          iso_timestamp_end: end,
          sql,
        },
      },
    );
    return { logs: Array.isArray(data.result) ? data.result : [] };
  },
});
