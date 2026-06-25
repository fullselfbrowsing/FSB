// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../posthog-api.js';

export const listInsights = defineTool({
  name: 'list_insights',
  displayName: 'List Insights',
  description: 'List the saved insights in a PostHog project. Optionally filter by search term or favorited.',
  summary: 'List insights in a project',
  icon: 'list',
  group: 'Insights',
  input: z.object({
    project_id: z.number().int().describe('PostHog project ID'),
    search: z.string().optional().describe('Filter insights by name search term'),
    favorited: z.boolean().optional().describe('Only return favorited insights'),
    limit: z.number().int().optional().describe('Maximum number of insights to return'),
  }),
  output: z.object({
    insights: z
      .array(z.object({ id: z.number(), name: z.string() }))
      .describe('List of insights'),
  }),
  handle: async (params: { project_id: number }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:id/insights/ (default method).
    const data = await api<{ insights: Array<{ id: number; name: string }> }>(
      `/projects/${params.project_id}/insights/`
    );
    return data;
  },
});
