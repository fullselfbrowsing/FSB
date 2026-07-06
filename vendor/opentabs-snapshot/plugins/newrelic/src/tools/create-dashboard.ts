import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapWidgetToInput, pageInputSchema } from './schemas.js';

export const createDashboard = defineTool({
  name: 'create_dashboard',
  displayName: 'Create Dashboard',
  description:
    'Create a new dashboard with pages and widgets. Each page must have at least one widget. Widget types include markdown, billboard, table, line, bar, pie, and area charts powered by NRQL queries.',
  summary: 'Create a new dashboard',
  icon: 'plus',
  group: 'Dashboards',
  input: z.object({
    account_id: z.number().int().describe('Account ID to create the dashboard in'),
    name: z.string().min(1).describe('Dashboard name'),
    permissions: z
      .enum(['PRIVATE', 'PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE'])
      .optional()
      .describe('Permission level (default PRIVATE)'),
    pages: z.array(pageInputSchema).min(1).describe('Dashboard pages'),
  }),
  output: z.object({
    guid: z.string().describe('GUID of the created dashboard'),
    name: z.string().describe('Name of the created dashboard'),
  }),
  handle: async params => {
    const pages = params.pages.map(page => ({
      name: page.name,
      widgets: page.widgets.map(w => mapWidgetToInput(w, params.account_id)),
    }));

    const data = await graphql<{
      dashboardCreate: {
        entityResult: { guid: string; name: string } | null;
        errors: Array<{ description: string; type: string }> | null;
      };
    }>(
      `mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult { guid name }
          errors { description type }
        }
      }`,
      {
        accountId: params.account_id,
        dashboard: {
          name: params.name,
          permissions: params.permissions ?? 'PRIVATE',
          pages,
        },
      },
    );

    const result = data.dashboardCreate;
    if (result.errors?.length) {
      throw ToolError.validation(result.errors.map(e => e.description).join('; '));
    }

    return {
      guid: result.entityResult?.guid ?? '',
      name: result.entityResult?.name ?? '',
    };
  },
});
