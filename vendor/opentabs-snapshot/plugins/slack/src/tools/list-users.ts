import { paginationMetadataSchema } from './channel-schema.js';
import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const listUsers = defineTool({
  name: 'list_users',
  displayName: 'List Users',
  description: 'List users in the Slack workspace with optional pagination',
  summary: 'List workspace users',
  icon: 'contact',
  group: 'Users',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of users to return (default 100, max 1000)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response for fetching the next page'),
  }),
  output: z.object({
    members: z
      .array(
        z.object({
          id: z.string().describe('User ID'),
          name: z.string().describe('Username (handle)'),
          real_name: z.string().describe('Full display name'),
          is_admin: z.boolean().describe('Whether the user is a workspace admin'),
          is_bot: z.boolean().describe('Whether the user is a bot'),
        }),
      )
      .describe('Array of user objects'),
    response_metadata: paginationMetadataSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      limit: params.limit ?? 100,
    };
    if (params.cursor) {
      body.cursor = params.cursor;
    }
    const data = await slackApi<{
      members?: Array<{
        id: string;
        name: string;
        real_name?: string;
        is_admin?: boolean;
        is_bot?: boolean;
      }>;
      response_metadata?: { next_cursor: string };
    }>('users.list', body);
    return {
      members: (data.members ?? []).map(m => ({
        id: m.id,
        name: m.name,
        real_name: m.real_name ?? '',
        is_admin: m.is_admin ?? false,
        is_bot: m.is_bot ?? false,
      })),
      response_metadata: data.response_metadata,
    };
  },
});
