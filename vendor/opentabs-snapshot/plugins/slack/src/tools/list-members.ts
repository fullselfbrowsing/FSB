import { paginationMetadataSchema } from './channel-schema.js';
import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const listMembers = defineTool({
  name: 'list_members',
  displayName: 'List Members',
  description:
    'List member user IDs of a Slack channel with optional pagination. Returns user IDs only — ' +
    'use get_user_profile to resolve a specific user ID to a name/profile, or list_users to get all workspace users with names.',
  summary: 'List members of a channel',
  icon: 'users',
  group: 'Users',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID to list members for (e.g., C01234567)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of members to return (default 100, max 1000)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response for fetching the next page'),
  }),
  output: z.object({
    members: z.array(z.string().describe('User ID')).describe('Array of user IDs who are members of the channel'),
    response_metadata: paginationMetadataSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      channel: params.channel,
      limit: params.limit ?? 100,
    };
    if (params.cursor) {
      body.cursor = params.cursor;
    }
    const data = await slackApi<{
      members?: string[];
      response_metadata?: { next_cursor: string };
    }>('conversations.members', body);
    return {
      members: data.members ?? [],
      response_metadata: data.response_metadata,
    };
  },
});
