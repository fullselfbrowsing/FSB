import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const removeReaction = defineTool({
  name: 'remove_reaction',
  displayName: 'Remove Reaction',
  description: "Remove an emoji reaction from a Slack message. Removes the authenticated user's reaction.",
  summary: 'Remove emoji reaction',
  icon: 'minus-circle',
  group: 'Reactions',
  input: z.object({
    channel: z.string().describe('Channel ID where the message is located (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message to remove the reaction from'),
    emoji: z.string().describe('Emoji name without colons (e.g., "thumbsup")'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    const name = params.emoji.replace(/^:|:$/g, '');
    await slackApi('reactions.remove', {
      channel: params.channel,
      timestamp: params.timestamp,
      name,
    });
    return { success: true };
  },
});
