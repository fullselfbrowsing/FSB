import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentUserData, graphql } from '../facebook-api.js';

const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY', 'NONE'] as const;

/** Map reaction names to Facebook's internal numeric codes. */
const REACTION_CODES: Record<string, number> = {
  LIKE: 1,
  LOVE: 2,
  WOW: 3,
  HAHA: 4,
  SAD: 7,
  ANGRY: 8,
  NONE: 0,
};

export const reactToPost = defineTool({
  name: 'react_to_post',
  displayName: 'React to Post',
  description:
    'Add or remove a reaction on a Facebook post. Requires the feedback_id from get_user_posts. ' +
    'Set reaction to "NONE" to remove an existing reaction. ' +
    'Available reactions: LIKE, LOVE, HAHA, WOW, SAD, ANGRY.',
  summary: 'React to a Facebook post',
  icon: 'heart',
  group: 'Interactions',
  input: z.object({
    feedback_id: z.string().describe('Feedback ID of the post (from get_user_posts)'),
    reaction: z.enum(REACTION_TYPES).describe('Reaction type: LIKE, LOVE, HAHA, WOW, SAD, ANGRY, or NONE to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the reaction was applied'),
  }),
  handle: async params => {
    if (!params.feedback_id) {
      throw ToolError.validation('feedback_id is required.');
    }

    const user = getCurrentUserData();
    const reactionCode = REACTION_CODES[params.reaction] ?? 0;

    await graphql('CometUFIFeedbackReactMutation', {
      input: {
        feedback_id: params.feedback_id,
        feedback_reaction: reactionCode,
        feedback_source: 'OBJECT',
        is_undo: params.reaction === 'NONE',
        actor_id: user.userId,
        client_mutation_id: '1',
      },
    });

    return { success: true };
  },
});
