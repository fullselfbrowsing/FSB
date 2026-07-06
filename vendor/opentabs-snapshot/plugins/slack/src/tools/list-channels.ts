import { channelSchema, mapChannel, paginationMetadataSchema } from './channel-schema.js';
import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import type { SlackChannel } from './channel-schema.js';

export const listChannels = defineTool({
  name: 'list_channels',
  displayName: 'List Channels',
  description: 'List channels in the Slack workspace with optional pagination',
  summary: 'List workspace channels',
  icon: 'list',
  group: 'Channels',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of channels to return (default 100, max 1000)'),
    types: z
      .string()
      .optional()
      .describe(
        'Comma-separated channel types to include (default "public_channel" — options: public_channel, private_channel, mpim, im)',
      ),
    cursor: z.string().optional().describe('Pagination cursor from a previous response for fetching the next page'),
    exclude_archived: z
      .boolean()
      .optional()
      .describe('Set to true to exclude archived channels from results (default false)'),
  }),
  output: z.object({
    channels: z.array(channelSchema).describe('Array of channels matching the filter criteria'),
    response_metadata: paginationMetadataSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      limit: params.limit ?? 100,
      types: params.types ?? 'public_channel',
    };
    if (params.cursor) {
      body.cursor = params.cursor;
    }
    if (params.exclude_archived !== undefined) {
      body.exclude_archived = params.exclude_archived;
    }
    const data = await slackApi<{
      channels?: SlackChannel[];
      response_metadata?: { next_cursor: string };
    }>('conversations.list', body);
    return {
      channels: (data.channels ?? []).map(mapChannel),
      response_metadata: data.response_metadata,
    };
  },
});
