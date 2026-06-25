import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const starMessage = defineTool({
  name: 'star_message',
  displayName: 'Star Message',
  description: 'Add a star to a Slack message for quick access later. Starred items appear in your saved items list.',
  summary: 'Star a message',
  icon: 'star',
  group: 'Stars',
  input: z.object({
    channel: z.string().describe('Channel ID where the message exists (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to star'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('stars.add', {
      channel: params.channel,
      timestamp: params.timestamp,
    });
    return { success: true };
  },
});
