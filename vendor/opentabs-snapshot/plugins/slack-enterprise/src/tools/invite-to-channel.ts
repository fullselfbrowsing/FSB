import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const inviteToChannel = defineTool({
  name: 'invite_to_channel',
  displayName: 'Invite to Channel',
  description:
    'Invite one or more users to a Slack channel. Invited users receive a notification and gain access to the full channel history.',
  summary: 'Add users to a channel',
  icon: 'user-plus',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to invite users to (e.g., C1234567890)'),
    users: z.string().describe('Comma-separated list of user IDs to invite (e.g., U1234567,U7654321)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('conversations.invite', {
      channel: params.channel,
      users: params.users,
    });
    return { success: true };
  },
});
