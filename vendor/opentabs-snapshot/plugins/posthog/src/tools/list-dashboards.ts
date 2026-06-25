import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import {
  type PaginatedResponse,
  type RawDashboard,
  dashboardSchema,
  mapDashboard,
  paginationInput,
  paginationOutput,
} from './schemas.js';

export const listDashboards = defineTool({
  name: 'list_dashboards',
  displayName: 'List Dashboards',
  description: 'List all dashboards in the current PostHog project. Returns dashboard names, tags, and tile counts.',
  summary: 'List dashboards in the project',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    ...paginationInput.shape,
  }),
  output: z.object({
    dashboards: z.array(dashboardSchema).describe('List of dashboards'),
    ...paginationOutput.shape,
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawDashboard>>(`/api/environments/${getTeamId()}/dashboards/`, {
      query: { limit: params.limit, offset: params.offset },
    });
    return {
      dashboards: (data.results ?? []).map(mapDashboard),
      count: data.count ?? 0,
      has_next: data.next != null,
    };
  },
});
