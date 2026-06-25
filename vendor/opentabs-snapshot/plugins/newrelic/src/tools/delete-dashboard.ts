import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const deleteDashboard = defineTool({
  name: 'delete_dashboard',
  displayName: 'Delete Dashboard',
  description: 'Permanently delete a dashboard by its GUID. This action cannot be undone.',
  summary: 'Delete a dashboard',
  icon: 'trash-2',
  group: 'Dashboards',
  input: z.object({
    guid: z.string().min(1).describe('Dashboard entity GUID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const data = await graphql<{
      dashboardDelete: {
        status: string;
        errors: Array<{ description: string; type: string }> | null;
      };
    }>(
      `mutation DeleteDashboard($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors { description type }
        }
      }`,
      { guid: params.guid },
    );

    if (data.dashboardDelete.errors?.length) {
      throw ToolError.internal(data.dashboardDelete.errors.map(e => e.description).join('; '));
    }
    return { success: true };
  },
});
