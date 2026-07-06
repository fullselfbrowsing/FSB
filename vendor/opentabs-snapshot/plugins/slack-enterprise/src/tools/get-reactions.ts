import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapReaction, reactionSchema } from './schemas.js';

export const getReactions = defineTool({
  name: 'get_reactions',
  displayName: 'Get Reactions',
  description: 'Get all reactions on a Slack message with emoji names and user lists.',
  summary: 'Get reactions on a message',
  icon: 'heart',
  group: 'Reactions',
  input: z.object({
    channel: z.string().describe('Channel ID where the message exists (e.g., C1234567890)'),
    timestamp: z.string().describe('Timestamp of the message'),
    full: z.boolean().optional().default(false).describe('Return complete user list for each reaction (default false)'),
  }),
  output: z.object({
    reactions: z.array(reactionSchema),
  }),
  handle: async params => {
    const data = await slackApi<{
      message: { reactions?: Array<Record<string, unknown>> };
    }>('reactions.get', {
      channel: params.channel,
      timestamp: params.timestamp,
      full: params.full ?? false,
    });
    return {
      reactions: (data.message?.reactions ?? []).map(mapReaction),
    };
  },
});
