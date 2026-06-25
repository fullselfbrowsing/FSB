import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const leaveChannel = defineTool({
  name: 'leave_channel',
  displayName: 'Leave Channel',
  description:
    'Leave a Slack channel. You will stop receiving notifications and the channel will be removed from your sidebar.',
  summary: 'Leave a channel',
  icon: 'log-out',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to leave (e.g., C1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('conversations.leave', { channel: params.channel });
    return { success: true };
  },
});
