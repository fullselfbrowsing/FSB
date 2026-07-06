import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getTeamId, softDelete } from '../posthog-api.js';

export const deleteDashboard = defineTool({
  name: 'delete_dashboard',
  displayName: 'Delete Dashboard',
  description: 'Delete a dashboard by marking it as deleted (soft delete). The dashboard can potentially be recovered.',
  summary: 'Delete a dashboard',
  icon: 'trash-2',
  group: 'Dashboards',
  input: z.object({
    dashboard_id: z.number().int().describe('Dashboard ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await softDelete(`/api/environments/${getTeamId()}/dashboards/${params.dashboard_id}/`);
    return { success: true };
  },
});
