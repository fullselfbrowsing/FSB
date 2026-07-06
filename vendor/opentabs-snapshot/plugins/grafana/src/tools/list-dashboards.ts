// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../grafana-api.js';

export const listDashboards = defineTool({
  name: 'list_dashboards',
  displayName: 'List Dashboards',
  description: 'List the Grafana dashboards in your organization. Optionally filter by folder or tag.',
  summary: 'list dashboards on grafana',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    folder: z.string().optional().describe('Folder ID or title to filter by'),
    tag: z.string().optional().describe('Dashboard tag to filter by'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of dashboards to return'),
  }),
  output: z.object({
    dashboards: z.array(z.object({
      uid: z.string(),
      title: z.string(),
    })).describe('The Grafana dashboards'),
  }),
  handle: async (params: { folder?: string; tag?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /api/search (default method, a READ).
    const data = await api<{ dashboards: unknown[] }>('/api/search', {
      query: { folder: params.folder, tag: params.tag, limit: params.limit },
    });
    return { dashboards: data.dashboards as { uid: string; title: string }[] };
  },
});
