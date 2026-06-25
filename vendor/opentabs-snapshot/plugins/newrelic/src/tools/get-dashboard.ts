import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { dashboardSchema, mapDashboard } from './schemas.js';
import type { RawDashboard } from './schemas.js';

export const getDashboard = defineTool({
  name: 'get_dashboard',
  displayName: 'Get Dashboard',
  description: 'Get detailed information about a specific dashboard by its GUID, including pages and widgets.',
  summary: 'Get dashboard details by GUID',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    guid: z.string().min(1).describe('Dashboard entity GUID'),
  }),
  output: z.object({
    dashboard: dashboardSchema.describe('Dashboard details'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: {
        entity:
          | (RawDashboard & {
              description?: string;
              pages?: Array<{
                guid?: string;
                name?: string;
                widgets?: Array<{ id?: string; title?: string; visualization?: { id?: string } }>;
              }>;
            })
          | null;
      };
    }>(
      `query GetDashboard($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            guid name
            ... on DashboardEntity {
              description permissions
              owner { email }
              createdAt updatedAt
              pages {
                guid name
                widgets { id title visualization { id } }
              }
            }
          }
        }
      }`,
      { guid: params.guid },
    );
    if (!data.actor.entity) throw ToolError.notFound(`Dashboard not found: ${params.guid}`);
    return { dashboard: mapDashboard(data.actor.entity) };
  },
});
