import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawInsight, insightSchema, mapInsight } from './schemas.js';

export const updateInsight = defineTool({
  name: 'update_insight',
  displayName: 'Update Insight',
  description: 'Update an existing insight. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an insight',
  icon: 'pencil',
  group: 'Insights',
  input: z.object({
    insight_id: z.number().int().describe('Insight ID'),
    name: z.string().optional().describe('New name'),
    description: z.string().optional().describe('New description'),
    favorited: z.boolean().optional().describe('Favorite status'),
    tags: z.array(z.string()).optional().describe('New tags'),
  }),
  output: z.object({
    insight: insightSchema.describe('The updated insight'),
  }),
  handle: async params => {
    const teamId = getTeamId();

    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.description !== undefined) body.description = params.description;
    if (params.favorited !== undefined) body.favorited = params.favorited;
    if (params.tags !== undefined) body.tags = params.tags;

    const data = await api<RawInsight>(`/api/environments/${teamId}/insights/${params.insight_id}/`, {
      method: 'PATCH',
      body,
    });
    return { insight: mapInsight(data) };
  },
});
