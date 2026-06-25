// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const getSite = defineTool({
  name: 'get_site',
  displayName: 'Get Site',
  description: 'Get detailed information about a specific Netlify site by its site ID.',
  summary: 'Get a site by ID',
  icon: 'globe',
  group: 'Sites',
  input: z.object({
    site_id: z.string().min(1).describe('Site ID to retrieve'),
  }),
  output: z.object({
    id: z.string().describe('Site ID'),
    name: z.string().describe('Site name'),
    url: z.string().optional().describe('Site URL'),
  }),
  handle: async (params: { site_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /sites/:site_id (default method).
    const data = await api<{ id: string; name: string }>(`/sites/${params.site_id}`);
    return data;
  },
});
