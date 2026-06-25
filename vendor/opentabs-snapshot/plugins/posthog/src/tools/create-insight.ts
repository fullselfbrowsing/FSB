import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawInsight, insightSchema, mapInsight } from './schemas.js';

export const createInsight = defineTool({
  name: 'create_insight',
  displayName: 'Create Insight',
  description:
    'Create a new saved insight in the current PostHog project. Provide a HogQL query string and the insight will be created as a HogQL visualization. Optionally specify a name, description, and dashboard to add it to.',
  summary: 'Create a new saved insight',
  icon: 'plus',
  group: 'Insights',
  input: z.object({
    name: z.string().optional().describe('Insight name'),
    description: z.string().optional().describe('Insight description'),
    query: z.string().describe('HogQL query string for the insight'),
    dashboard_id: z.number().int().optional().describe('Dashboard ID to add the insight to'),
    tags: z.array(z.string()).optional().describe('Tags to attach'),
  }),
  output: z.object({
    insight: insightSchema.describe('The created insight'),
  }),
  handle: async params => {
    const teamId = getTeamId();

    const body: Record<string, unknown> = {
      name: params.name ?? '',
      description: params.description ?? '',
      query: {
        kind: 'DataTableNode',
        source: {
          kind: 'HogQLQuery',
          query: params.query,
        },
      },
      saved: true,
    };

    if (params.tags) {
      body.tags = params.tags;
    }

    if (params.dashboard_id) {
      body.dashboards = [params.dashboard_id];
    }

    const data = await api<RawInsight>(`/api/environments/${teamId}/insights/`, {
      method: 'POST',
      body,
    });

    return { insight: mapInsight(data) };
  },
});
