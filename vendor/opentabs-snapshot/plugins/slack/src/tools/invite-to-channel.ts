import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const inviteToChannel = defineTool({
  name: 'invite_to_channel',
  displayName: 'Invite to Channel',
  description: 'Invite a user to a Slack channel',
  summary: 'Invite a user to a channel',
  icon: 'user-plus',
  group: 'Users',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID to invite the user to (e.g., C01234567)'),
    user: z.string().min(1).describe('User ID to invite (e.g., U01234567)'),
  }),
  output: z.object({
    channel: z
      .object({
        id: z.string().describe('Channel ID the user was invited to'),
        name: z.string().describe('Channel name'),
      })
      .describe('The channel the user was invited to'),
  }),
  handle: async params => {
    const data = await slackApi<{
      channel: { id?: string; name?: string };
    }>('conversations.invite', {
      channel: params.channel,
      users: params.user,
    });
    return {
      channel: {
        id: data.channel.id ?? '',
        name: data.channel.name ?? '',
      },
    };
  },
});
