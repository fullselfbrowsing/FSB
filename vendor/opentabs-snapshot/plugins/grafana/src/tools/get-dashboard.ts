// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../grafana-api.js';

export const getDashboard = defineTool({
  name: 'get_dashboard',
  displayName: 'Get Dashboard',
  description: 'Get the full definition (panels, variables, and layout) of a single Grafana dashboard by its UID.',
  summary: 'look up a single grafana dashboard',
  icon: 'gauge',
  group: 'Dashboards',
  input: z.object({
    uid: z.string().min(1).describe('The dashboard UID to fetch'),
  }),
  output: z.object({
    dashboard: z.object({
      uid: z.string(),
      title: z.string(),
      panels: z.number(),
    }).describe('The dashboard definition'),
  }),
  handle: async (params: { uid: string }) => {
    // NEVER executed by the importer. Upstream: api GET /api/dashboards/uid/:uid (default method, a READ).
    const data = await api<{ dashboard: { uid: string; title: string; panels: number } }>(
      `/api/dashboards/uid/${params.uid}`
    );
    return { dashboard: data.dashboard };
  },
});
