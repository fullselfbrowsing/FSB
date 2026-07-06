import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const joinChannel = defineTool({
  name: 'join_channel',
  displayName: 'Join Channel',
  description:
    'Join a public Slack channel. Only works for public channels — private channels require an invitation via invite_to_channel.',
  summary: 'Join a public channel',
  icon: 'log-in',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to join (e.g., C1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('conversations.join', { channel: params.channel });
    return { success: true };
  },
});
