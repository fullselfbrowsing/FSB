import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const pinMessage = defineTool({
  name: 'pin_message',
  displayName: 'Pin Message',
  description: 'Pin a message to a Slack channel. Pinning posts a notification in the channel visible to all members.',
  summary: 'Pin a message',
  icon: 'pin',
  group: 'Pins',
  input: z.object({
    channel: z.string().describe('Channel ID where the message is located (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to pin'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('pins.add', {
      channel: params.channel,
      timestamp: params.timestamp,
    });
    return { success: true };
  },
});
