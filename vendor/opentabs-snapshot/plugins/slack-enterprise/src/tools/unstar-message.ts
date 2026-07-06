import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const unstarMessage = defineTool({
  name: 'unstar_message',
  displayName: 'Unstar Message',
  description: 'Remove a star from a Slack message.',
  summary: 'Unstar a message',
  icon: 'star-off',
  group: 'Stars',
  input: z.object({
    channel: z.string().describe('Channel ID where the message exists (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to unstar'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('stars.remove', {
      channel: params.channel,
      timestamp: params.timestamp,
    });
    return { success: true };
  },
});
