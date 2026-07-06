import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { channelSchema, mapChannel, paginationMetadataSchema } from './schemas.js';

export const listChannels = defineTool({
  name: 'list_channels',
  displayName: 'List Channels',
  description:
    'List channels in the Slack workspace with type filtering, archive exclusion, and cursor-based pagination. Supports public_channel, private_channel, mpim (group DM), and im (1:1 DM) types.',
  summary: 'List workspace channels',
  icon: 'hash',
  group: 'Channels',
  input: z.object({
    types: z
      .string()
      .optional()
      .default('public_channel,private_channel')
      .describe(
        'Comma-separated channel types: public_channel, private_channel, mpim, im (default "public_channel,private_channel")',
      ),
    limit: z.number().optional().default(100).describe('Maximum channels to return (default 100, max 1000)'),
    exclude_archived: z.boolean().optional().default(true).describe('Exclude archived channels (default true)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response for fetching the next page'),
  }),
  output: z.object({
    channels: z.array(channelSchema),
    pagination: paginationMetadataSchema,
  }),
  handle: async params => {
    const apiParams: Record<string, unknown> = {
      types: params.types ?? 'public_channel,private_channel',
      limit: Math.min(params.limit ?? 100, 1000),
      exclude_archived: params.exclude_archived ?? true,
    };
    if (params.cursor) apiParams.cursor = params.cursor;

    const data = await slackApi<{
      channels: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor?: string };
    }>('conversations.list', apiParams);

    return {
      channels: (data.channels ?? []).map(mapChannel),
      pagination: { next_cursor: data.response_metadata?.next_cursor },
    };
  },
});
