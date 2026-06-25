// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../datadog-api.js';

export const listDashboards = defineTool({
  name: 'list_dashboards',
  displayName: 'List Dashboards',
  description: 'List the dashboards in your Datadog account. Optionally filter to shared or your own dashboards.',
  summary: 'List dashboards in the account',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    filter_shared: z.boolean().optional().describe('Only return shared dashboards'),
    filter_deleted: z.boolean().optional().describe('Only return deleted dashboards'),
  }),
  output: z.object({
    dashboards: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .describe('List of dashboards'),
  }),
  handle: async (_params: { filter_shared?: boolean }) => {
    // NEVER executed by the importer. Upstream: api GET /dashboard (default method).
    const data = await api<{ dashboards: Array<{ id: string; title: string }> }>(`/dashboard`);
    return data;
  },
});
