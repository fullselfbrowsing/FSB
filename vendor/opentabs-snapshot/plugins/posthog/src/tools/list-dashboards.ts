// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../posthog-api.js';

export const listDashboards = defineTool({
  name: 'list_dashboards',
  displayName: 'List Dashboards',
  description: 'List the dashboards in a PostHog project. Optionally filter by pinned or search term.',
  summary: 'List dashboards in a project',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    project_id: z.number().int().describe('PostHog project ID'),
    pinned: z.boolean().optional().describe('Only return pinned dashboards'),
    search: z.string().optional().describe('Filter dashboards by name search term'),
  }),
  output: z.object({
    dashboards: z
      .array(z.object({ id: z.number(), name: z.string() }))
      .describe('List of dashboards'),
  }),
  handle: async (params: { project_id: number }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:id/dashboards/ (default method).
    const data = await api<{ dashboards: Array<{ id: number; name: string }> }>(
      `/projects/${params.project_id}/dashboards/`
    );
    return data;
  },
});
