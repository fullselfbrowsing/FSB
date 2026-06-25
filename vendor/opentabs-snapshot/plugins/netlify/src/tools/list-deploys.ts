// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const listDeploys = defineTool({
  name: 'list_deploys',
  displayName: 'List Deploys',
  description: 'List deploys for a Netlify site. Optionally filter by state (new, building, ready, error).',
  summary: 'List deploys for a site',
  icon: 'list',
  group: 'Deploys',
  input: z.object({
    site_id: z.string().min(1).describe('Site ID to list deploys for'),
    state: z.enum(['new', 'building', 'ready', 'error']).optional().describe('Filter by deploy state'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
  }),
  output: z.object({
    deploys: z
      .array(z.object({ id: z.string(), state: z.string() }))
      .describe('List of deploys'),
  }),
  handle: async (params: { site_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /sites/:site_id/deploys (default method).
    const data = await api<{ deploys: Array<{ id: string; state: string }> }>(`/sites/${params.site_id}/deploys`);
    return data;
  },
});
