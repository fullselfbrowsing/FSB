import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapWidgetToInput, pageInputSchema } from './schemas.js';

export const updateDashboard = defineTool({
  name: 'update_dashboard',
  displayName: 'Update Dashboard',
  description:
    'Update an existing dashboard. Replaces the entire dashboard definition — provide all pages and widgets, not just changes.',
  summary: 'Update an existing dashboard',
  icon: 'pencil',
  group: 'Dashboards',
  input: z.object({
    guid: z.string().min(1).describe('Dashboard entity GUID'),
    name: z.string().min(1).describe('New dashboard name'),
    permissions: z.enum(['PRIVATE', 'PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE']).optional().describe('Permission level'),
    pages: z.array(pageInputSchema).min(1).describe('Dashboard pages (replaces all existing pages)'),
    account_id: z.number().int().describe('Account ID for NRQL query context'),
  }),
  output: z.object({
    guid: z.string().describe('GUID of the updated dashboard'),
    name: z.string().describe('Updated dashboard name'),
  }),
  handle: async params => {
    const pages = params.pages.map(page => ({
      name: page.name,
      widgets: page.widgets.map(w => mapWidgetToInput(w, params.account_id)),
    }));

    const data = await graphql<{
      dashboardUpdate: {
        entityResult: { guid: string; name: string } | null;
        errors: Array<{ description: string; type: string }> | null;
      };
    }>(
      `mutation UpdateDashboard($guid: EntityGuid!, $dashboard: DashboardInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
          entityResult { guid name }
          errors { description type }
        }
      }`,
      {
        guid: params.guid,
        dashboard: {
          name: params.name,
          permissions: params.permissions ?? 'PRIVATE',
          pages,
        },
      },
    );

    const result = data.dashboardUpdate;
    if (result.errors?.length) {
      throw ToolError.validation(result.errors.map(e => e.description).join('; '));
    }
    return {
      guid: result.entityResult?.guid ?? '',
      name: result.entityResult?.name ?? '',
    };
  },
});
