import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawDashboard, dashboardSchema, mapDashboard } from './schemas.js';

export const updateDashboard = defineTool({
  name: 'update_dashboard',
  displayName: 'Update Dashboard',
  description: 'Update an existing dashboard. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update a dashboard',
  icon: 'pencil',
  group: 'Dashboards',
  input: z.object({
    dashboard_id: z.number().int().describe('Dashboard ID'),
    name: z.string().optional().describe('New name'),
    description: z.string().optional().describe('New description'),
    pinned: z.boolean().optional().describe('Whether to pin'),
    tags: z.array(z.string()).optional().describe('New tags'),
  }),
  output: z.object({
    dashboard: dashboardSchema.describe('The updated dashboard'),
  }),
  handle: async params => {
    const { dashboard_id, ...body } = params;
    const data = await api<RawDashboard>(`/api/environments/${getTeamId()}/dashboards/${dashboard_id}/`, {
      method: 'PATCH',
      body,
    });
    return { dashboard: mapDashboard(data) };
  },
});
