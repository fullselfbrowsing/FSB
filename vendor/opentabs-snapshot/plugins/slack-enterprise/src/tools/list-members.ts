import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { paginationMetadataSchema } from './schemas.js';

export const listMembers = defineTool({
  name: 'list_channel_members',
  displayName: 'List Channel Members',
  description:
    'List member user IDs of a Slack channel with cursor-based pagination. Returns user IDs — use get_user_info to resolve a specific user ID to a name/profile, or list_users to get all workspace users with names.',
  summary: 'List channel members',
  icon: 'users',
  group: 'Channels',
  input: z.object({
    channel: z.string().describe('Channel ID to list members for (e.g., C1234567890)'),
    limit: z.number().optional().default(100).describe('Maximum number of members to return (default 100, max 1000)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    members: z.array(z.string().describe('User ID')),
    pagination: paginationMetadataSchema,
  }),
  handle: async params => {
    const apiParams: Record<string, unknown> = {
      channel: params.channel,
      limit: Math.min(params.limit ?? 100, 1000),
    };
    if (params.cursor) apiParams.cursor = params.cursor;

    const data = await slackApi<{
      members: string[];
      response_metadata?: { next_cursor?: string };
    }>('conversations.members', apiParams);

    return {
      members: data.members ?? [],
      pagination: { next_cursor: data.response_metadata?.next_cursor },
    };
  },
});
