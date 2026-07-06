import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const reactToMessage = defineTool({
  name: 'react_to_message',
  displayName: 'React to Message',
  description:
    'Add an emoji reaction to a Slack message. Use emoji name without colons (e.g., "thumbsup" not ":thumbsup:").',
  summary: 'Add emoji reaction to a message',
  icon: 'smile-plus',
  group: 'Reactions',
  input: z.object({
    channel: z.string().describe('Channel ID where the message is located (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to react to'),
    emoji: z.string().describe('Emoji name without colons (e.g., "thumbsup", "heart", "rocket")'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    const name = params.emoji.replace(/^:|:$/g, '');
    await slackApi('reactions.add', {
      channel: params.channel,
      timestamp: params.timestamp,
      name,
    });
    return { success: true };
  },
});
