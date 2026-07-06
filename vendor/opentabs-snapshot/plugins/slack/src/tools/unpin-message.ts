import { slackApi } from '../slack-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const unpinMessage = defineTool({
  name: 'unpin_message',
  displayName: 'Unpin Message',
  description: 'Unpin a message from a Slack channel',
  summary: 'Unpin a message from a channel',
  icon: 'pin-off',
  group: 'Reactions',
  input: z.object({
    channel: z.string().min(1).describe('Channel ID where the message is pinned (e.g., C01234567)'),
    ts: z
      .string()
      .min(1)
      .describe('Timestamp of the message to unpin — serves as the unique message ID (e.g., 1234567890.123456)'),
  }),
  output: z.object({}),
  handle: async params => {
    await slackApi('pins.remove', {
      channel: params.channel,
      timestamp: params.ts,
    });
    return {};
  },
});
