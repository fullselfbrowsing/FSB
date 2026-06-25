import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';

const reactionSummarySchema = z.object({
  reaction_type: z.string().describe('Reaction type (LIKE, LOVE, HAHA, WOW, SAD, ANGRY)'),
  count: z.number().int().describe('Number of reactions of this type'),
});

interface ReactionsResponse {
  node?: {
    reactors?: {
      count?: number;
    };
    top_reactions?: {
      edges?: Array<{
        node?: { reaction_type?: string };
        reaction_count?: number;
      }>;
    };
  };
}

export const getReactions = defineTool({
  name: 'get_reactions',
  displayName: 'Get Reactions',
  description:
    'Get the reaction summary (counts per reaction type) for a Facebook post. Requires the feedback_id from get_user_posts.',
  summary: 'Get reaction counts on a post',
  icon: 'smile',
  group: 'Interactions',
  input: z.object({
    feedback_id: z.string().describe('Feedback ID of the post (from get_user_posts)'),
  }),
  output: z.object({
    total_count: z.number().int().describe('Total number of reactions'),
    reactions: z.array(reactionSummarySchema),
  }),
  handle: async params => {
    if (!params.feedback_id) {
      throw ToolError.validation('feedback_id is required.');
    }

    const data = await graphql<ReactionsResponse>('CometUFIReactionsDialogQuery', {
      feedbackTargetID: params.feedback_id,
      id: params.feedback_id,
      scale: 2,
    });

    const totalCount = data.node?.reactors?.count ?? 0;
    const edges = data.node?.top_reactions?.edges ?? [];

    return {
      total_count: totalCount,
      reactions: edges.map(e => ({
        reaction_type: e.node?.reaction_type ?? '',
        count: e.reaction_count ?? 0,
      })),
    };
  },
});
