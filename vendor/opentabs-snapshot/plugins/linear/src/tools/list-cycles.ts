import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cycleSchema, mapCycle, paginationSchema } from './schemas.js';

export const listCycles = defineTool({
  name: 'list_cycles',
  displayName: 'List Cycles',
  description: 'List cycles (sprints) for a team. Use this to find cycle IDs for creating or filtering issues.',
  summary: 'List cycles for a team',
  icon: 'rotate-cw',
  group: 'Workflow',
  input: z.object({
    team_id: z.string().describe('Team UUID to list cycles for (use list_teams to find IDs)'),
    limit: z.number().optional().describe('Maximum number of cycles to return (default 10, max 50)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    cycles: z.array(cycleSchema).describe('List of cycles ordered by start date'),
    pagination: paginationSchema.describe('Pagination info for fetching more results'),
  }),
  handle: async params => {
    const limit = Math.min(params.limit ?? 10, 50);

    const data = await graphql<{
      team: {
        cycles: {
          nodes: Record<string, unknown>[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }>(
      `query ListCycles($id: String!, $first: Int, $after: String) {
        team(id: $id) {
          cycles(first: $first, after: $after, orderBy: createdAt) {
            nodes {
              id number name startsAt endsAt isActive completedAt
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: params.team_id, first: limit, after: params.after },
    );

    if (!data.team) throw ToolError.notFound('Team not found');
    const result = data.team.cycles;
    return {
      cycles: result.nodes.map(n => mapCycle(n as Parameters<typeof mapCycle>[0])),
      pagination: {
        has_next_page: result.pageInfo?.hasNextPage ?? false,
        end_cursor: result.pageInfo?.endCursor ?? '',
      },
    };
  },
});
