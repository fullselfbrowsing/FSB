// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../datadog-api.js';

export const listMonitors = defineTool({
  name: 'list_monitors',
  displayName: 'List Monitors',
  description: 'List the monitors in your Datadog account. Optionally filter by name, tags, or monitor tags.',
  summary: 'List monitors in the account',
  icon: 'list',
  group: 'Monitors',
  input: z.object({
    name: z.string().optional().describe('Filter monitors by name substring'),
    tags: z.array(z.string()).optional().describe('Filter by monitor scope tags'),
    monitor_tags: z.array(z.string()).optional().describe('Filter by monitor (management) tags'),
    page: z.number().int().optional().describe('Page number for pagination (0-indexed)'),
  }),
  output: z.object({
    monitors: z
      .array(z.object({ id: z.number(), name: z.string() }))
      .describe('List of monitors'),
  }),
  handle: async (_params: { name?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /monitor (default method).
    const data = await api<{ monitors: Array<{ id: number; name: string }> }>(`/monitor`);
    return data;
  },
});
