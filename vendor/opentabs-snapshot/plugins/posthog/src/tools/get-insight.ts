import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawInsight, insightSchema, mapInsight } from './schemas.js';

export const getInsight = defineTool({
  name: 'get_insight',
  displayName: 'Get Insight',
  description:
    'Get detailed information about a specific insight including its query configuration and dashboard associations.',
  summary: 'Get insight details',
  icon: 'bar-chart-3',
  group: 'Insights',
  input: z.object({
    insight_id: z.number().int().describe('Insight ID'),
  }),
  output: z.object({
    insight: insightSchema.describe('The insight details'),
  }),
  handle: async params => {
    const teamId = getTeamId();
    const data = await api<RawInsight>(`/api/environments/${teamId}/insights/${params.insight_id}/`);
    return { insight: mapInsight(data) };
  },
});
