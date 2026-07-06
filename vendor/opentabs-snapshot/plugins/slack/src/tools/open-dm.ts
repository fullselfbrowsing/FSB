import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const openDm = defineTool({
  name: 'open_dm',
  displayName: 'Open DM',
  description:
    'Open a direct message conversation with one or more users. Returns an existing DM channel if one already exists, or creates a new one. For multi-person DMs (group DMs), pass multiple comma-separated user IDs.',
  summary: 'Open a direct message conversation',
  icon: 'mail',
  group: 'DMs',
  input: z.object({
    users: z
      .string()
      .min(1)
      .describe(
        'Comma-separated user IDs to open a DM with (e.g., U01234567 for 1:1, or U01234567,U07654321 for group DM)',
      ),
  }),
  output: z.object({
    channel_id: z.string().describe('Channel ID of the DM conversation — use this for sending messages'),
    already_open: z.boolean().describe('Whether the DM conversation already existed'),
  }),
  handle: async params => {
    const data = await slackApi<{
      channel?: { id?: string };
      already_open?: boolean;
      no_op?: boolean;
    }>('conversations.open', {
      users: params.users,
      return_im: true,
    });
    return {
      channel_id: data.channel?.id ?? '',
      already_open: data.already_open ?? data.no_op ?? false,
    };
  },
});
