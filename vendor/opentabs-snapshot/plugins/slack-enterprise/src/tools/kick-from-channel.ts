import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const kickFromChannel = defineTool({
  name: 'kick_from_channel',
  displayName: 'Remove from Channel',
  description: 'Remove a user from a Slack channel. The user will be notified of the removal.',
  summary: 'Remove a user from a channel',
  icon: 'user-minus',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to remove user from (e.g., C1234567890)'),
    user: z.string().describe('User ID to remove (e.g., U1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('conversations.kick', {
      channel: params.channel,
      user: params.user,
    });
    return { success: true };
  },
});
