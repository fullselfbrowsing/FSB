import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const unpinMessage = defineTool({
  name: 'unpin_message',
  displayName: 'Unpin Message',
  description: 'Remove a pinned message from a Slack channel.',
  summary: 'Unpin a message',
  icon: 'pin-off',
  group: 'Pins',
  input: z.object({
    channel: z.string().describe('Channel ID where the message is pinned (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to unpin'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('pins.remove', {
      channel: params.channel,
      timestamp: params.timestamp,
    });
    return { success: true };
  },
});
