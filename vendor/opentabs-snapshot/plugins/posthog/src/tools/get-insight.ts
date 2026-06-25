// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../posthog-api.js';

export const getInsight = defineTool({
  name: 'get_insight',
  displayName: 'Get Insight',
  description: 'Get detailed information about a single PostHog insight by its insight ID.',
  summary: 'Get an insight by id',
  icon: 'bar-chart',
  group: 'Insights',
  input: z.object({
    project_id: z.number().int().describe('PostHog project ID'),
    insight_id: z.number().int().describe('PostHog insight ID'),
  }),
  output: z.object({
    id: z.number().describe('Insight ID'),
    name: z.string().describe('Insight name'),
    short_id: z.string().optional().describe('Insight short ID'),
  }),
  handle: async (params: { project_id: number; insight_id: number }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:id/insights/:insight_id/ (default method).
    const data = await api<{ id: number; name: string }>(
      `/projects/${params.project_id}/insights/${params.insight_id}/`
    );
    return data;
  },
});
