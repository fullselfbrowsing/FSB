import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawDashboard, dashboardSchema, mapDashboard } from './schemas.js';

export const getDashboard = defineTool({
  name: 'get_dashboard',
  displayName: 'Get Dashboard',
  description: 'Get detailed information about a specific dashboard including its tiles and sharing status.',
  summary: 'Get dashboard details',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    dashboard_id: z.number().int().describe('Dashboard ID'),
  }),
  output: z.object({
    dashboard: dashboardSchema.describe('The dashboard details'),
  }),
  handle: async params => {
    const data = await api<RawDashboard>(`/api/environments/${getTeamId()}/dashboards/${params.dashboard_id}/`);
    return { dashboard: mapDashboard(data) };
  },
});
