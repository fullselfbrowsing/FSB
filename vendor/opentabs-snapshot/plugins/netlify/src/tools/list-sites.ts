// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const listSites = defineTool({
  name: 'list_sites',
  displayName: 'List Sites',
  description: 'List sites in a Netlify account or team. Optionally filter by name or owning team slug.',
  summary: 'List sites',
  icon: 'list',
  group: 'Sites',
  input: z.object({
    team_slug: z.string().optional().describe('Team slug that owns the sites'),
    name: z.string().optional().describe('Filter sites by name substring'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
  }),
  output: z.object({
    sites: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .describe('List of sites'),
  }),
  handle: async (_params: { team_slug?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /sites (default method).
    const data = await api<{ sites: Array<{ id: string; name: string }> }>(`/sites`);
    return data;
  },
});
