import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawInsight,
  insightSchema,
  mapInsight,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listInsights = defineTool({
  name: 'list_insights',
  displayName: 'List Insights',
  description:
    'List insights (trends, funnels, retention, paths, etc.) in the current PostHog project. Insights are the core analytics visualizations.',
  summary: 'List insights in the project',
  icon: 'bar-chart-3',
  group: 'Insights',
  input: z.object({
    ...paginationInput.shape,
    short_id: z.string().optional().describe('Filter by short ID'),
    saved: z.boolean().optional().describe('Filter by saved status'),
  }),
  output: z.object({
    insights: z.array(insightSchema).describe('List of insights'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const teamId = getTeamId();
    const data = await api<PaginatedResponse<RawInsight>>(`/api/environments/${teamId}/insights/`, {
      query: {
        limit: params.limit,
        offset: params.offset,
        short_id: params.short_id,
        saved: params.saved,
      },
    });
    return {
      insights: (data.results ?? []).map(mapInsight),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
