import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawDashboard, dashboardSchema, mapDashboard } from './schemas.js';

export const createDashboard = defineTool({
  name: 'create_dashboard',
  displayName: 'Create Dashboard',
  description: 'Create a new dashboard in the current PostHog project.',
  summary: 'Create a new dashboard',
  icon: 'plus',
  group: 'Dashboards',
  input: z.object({
    name: z.string().describe('Dashboard name'),
    description: z.string().optional().describe('Dashboard description'),
    pinned: z.boolean().optional().describe('Whether to pin the dashboard'),
    tags: z.array(z.string()).optional().describe('Tags to attach'),
  }),
  output: z.object({
    dashboard: dashboardSchema.describe('The created dashboard'),
  }),
  handle: async params => {
    const data = await api<RawDashboard>(`/api/environments/${getTeamId()}/dashboards/`, {
      method: 'POST',
      body: params,
    });
    return { dashboard: mapDashboard(data) };
  },
});
