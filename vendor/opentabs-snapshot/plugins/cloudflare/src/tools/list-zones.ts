// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../cloudflare-api.js';

export const listZones = defineTool({
  name: 'list_zones',
  displayName: 'List Zones',
  description: 'List the zones (domains) in your Cloudflare account. Optionally filter by name or status.',
  summary: 'List zones in the account',
  icon: 'globe',
  group: 'Zones',
  input: z.object({
    name: z.string().optional().describe('Filter zones by exact domain name'),
    status: z
      .enum(['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'])
      .optional()
      .describe('Filter by zone status'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
    per_page: z.number().int().optional().describe('Results per page (max 50)'),
  }),
  output: z.object({
    zones: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .describe('List of zones'),
  }),
  handle: async (params: { name?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /zones (default method).
    const data = await api<{ zones: Array<{ id: string; name: string }> }>(
      `/zones${params.name ? `?name=${encodeURIComponent(params.name)}` : ''}`
    );
    return data;
  },
});
