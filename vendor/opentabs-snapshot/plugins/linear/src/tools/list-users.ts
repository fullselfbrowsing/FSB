import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapUser, paginationSchema, userSchema } from './schemas.js';

export const listUsers = defineTool({
  name: 'list_users',
  displayName: 'List Users',
  description: 'List all users in the Linear organization. Use this to find user IDs for assigning issues.',
  summary: 'List all users in the organization',
  icon: 'users',
  group: 'Teams & Users',
  input: z.object({
    limit: z.number().optional().describe('Maximum number of users to return (default 50, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('List of users'),
    pagination: paginationSchema.describe('Pagination info for fetching more results'),
  }),
  handle: async params => {
    const limit = Math.min(params.limit ?? 50, 100);

    const data = await graphql<{
      users: {
        nodes: Record<string, unknown>[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    }>(
      `query ListUsers($first: Int, $after: String) {
        users(first: $first, after: $after) {
          nodes {
            id name email displayName active admin
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { first: limit, after: params.after },
    );

    if (!data.users) throw ToolError.internal('Users query returned no results object');
    const result = data.users;
    return {
      users: result.nodes.map(n => mapUser(n as Parameters<typeof mapUser>[0])),
      pagination: {
        has_next_page: result.pageInfo?.hasNextPage ?? false,
        end_cursor: result.pageInfo?.endCursor ?? '',
      },
    };
  },
});
