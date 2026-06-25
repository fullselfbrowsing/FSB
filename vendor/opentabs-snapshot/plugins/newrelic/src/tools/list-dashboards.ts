import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { dashboardSchema, mapDashboard } from './schemas.js';
import type { RawDashboard } from './schemas.js';

export const listDashboards = defineTool({
  name: 'list_dashboards',
  displayName: 'List Dashboards',
  description:
    'List dashboards accessible to the current user. Returns dashboard names, GUIDs, permissions, and page details.',
  summary: 'List dashboards',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    dashboards: z.array(dashboardSchema).describe('List of dashboards'),
    next_cursor: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: {
        entitySearch: {
          results: {
            entities: RawDashboard[];
            nextCursor: string | null;
          };
        };
      };
    }>(
      `query ListDashboards($cursor: String) {
        actor {
          entitySearch(query: "domain = 'VIZ' AND type = 'DASHBOARD'") {
            results(cursor: $cursor) {
              entities {
                guid name
                ... on DashboardEntityOutline {
                  permissions owner { email } dashboardParentGuid
                }
                tags { key values }
              }
              nextCursor
            }
          }
        }
      }`,
      { cursor: params.cursor },
    );
    const results = data.actor.entitySearch?.results;
    return {
      dashboards: (results?.entities ?? []).map(mapDashboard),
      next_cursor: results?.nextCursor ?? '',
    };
  },
});
