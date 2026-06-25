import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapUser, paginationMetadataSchema, userSchema } from './schemas.js';

export const listUsers = defineTool({
  name: 'list_users',
  displayName: 'List Users',
  description:
    'List users in the Slack workspace with cursor-based pagination. Returns user IDs, names, admin status, and bot flag.',
  summary: 'List workspace users',
  icon: 'users',
  group: 'Users',
  input: z.object({
    limit: z.number().optional().default(100).describe('Maximum number of users to return (default 100, max 1000)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    users: z.array(userSchema),
    pagination: paginationMetadataSchema,
  }),
  handle: async params => {
    const apiParams: Record<string, unknown> = {
      limit: Math.min(params.limit ?? 100, 1000),
    };
    if (params.cursor) apiParams.cursor = params.cursor;

    const data = await slackApi<{
      members: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor?: string };
    }>('users.list', apiParams);

    return {
      users: (data.members ?? []).map(mapUser),
      pagination: { next_cursor: data.response_metadata?.next_cursor },
    };
  },
});
