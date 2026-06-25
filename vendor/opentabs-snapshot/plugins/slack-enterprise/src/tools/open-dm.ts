import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const openDm = defineTool({
  name: 'open_dm',
  displayName: 'Open DM',
  description:
    'Open a direct message conversation with one or more users. Returns an existing DM channel if one already exists, or creates a new one. For multi-person DMs (group DMs), pass multiple comma-separated user IDs.',
  summary: 'Open a direct message',
  icon: 'message-circle',
  group: 'Direct Messages',
  input: z.object({
    users: z
      .string()
      .describe(
        'Comma-separated user IDs to open a DM with (e.g., U1234567 for 1:1, or U1234567,U7654321 for group DM)',
      ),
  }),
  output: z.object({
    channel_id: z.string().describe('DM channel ID'),
    already_open: z.boolean().describe('Whether the DM already existed'),
  }),
  handle: async params => {
    const data = await slackApi<{
      channel: { id: string };
      already_open: boolean;
    }>('conversations.open', { users: params.users });
    return {
      channel_id: data.channel?.id ?? '',
      already_open: data.already_open ?? false,
    };
  },
});
