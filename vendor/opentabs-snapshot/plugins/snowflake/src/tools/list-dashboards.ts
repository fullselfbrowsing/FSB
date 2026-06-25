import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { listEntities } from '../snowflake-api.js';

const dashboardSchema = z.object({
  entityId: z.string().describe('Dashboard entity ID'),
  name: z.string().describe('Dashboard name'),
  created: z.string().describe('Creation timestamp (ISO 8601)'),
  modified: z.string().describe('Last modified timestamp (ISO 8601)'),
  url: z.string().describe('Relative URL path to the dashboard'),
  visibility: z.string().describe('Visibility (private, organization)'),
});

export const listDashboards = defineTool({
  name: 'list_dashboards',
  displayName: 'List Dashboards',
  description: 'List Snowflake dashboards, sorted by most recently modified. Supports pagination.',
  summary: 'List Snowflake dashboards',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum dashboards to return (default 50)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    dashboards: z.array(dashboardSchema).describe('List of dashboards'),
    cursor: z.string().describe('Cursor for the next page, empty if no more results'),
  }),
  handle: async params => {
    const result = await listEntities({
      location: 'dashboards',
      types: ['dashboard'],
      limit: params.limit ?? 50,
      cursor: params.cursor,
    });

    const dashboards = result.entities
      .filter(e => e.info)
      .map(e => ({
        entityId: e.entityId ?? '',
        name: e.info?.name ?? '',
        created: e.info?.created ?? '',
        modified: e.info?.modified ?? '',
        url: e.info?.url ?? '',
        visibility: e.info?.visibility ?? '',
      }));

    return {
      dashboards,
      cursor: result.next,
    };
  },
});
