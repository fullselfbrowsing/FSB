import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getTeamId, softDelete } from '../posthog-api.js';

export const deleteInsight = defineTool({
  name: 'delete_insight',
  displayName: 'Delete Insight',
  description: 'Delete an insight by marking it as deleted (soft delete).',
  summary: 'Delete an insight',
  icon: 'trash-2',
  group: 'Insights',
  input: z.object({
    insight_id: z.number().int().describe('Insight ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    const teamId = getTeamId();
    await softDelete(`/api/environments/${teamId}/insights/${params.insight_id}/`);
    return { success: true };
  },
});
