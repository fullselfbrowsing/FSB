import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getViewerId } from '../medium-api.js';

interface ClapData {
  clap: { id: string; clapCount: number; voterCount: number };
}

export const clapPost = defineTool({
  name: 'clap_post',
  displayName: 'Clap Post',
  description: 'Clap (like) a Medium post. Each user can clap up to 50 times per post. Returns the updated clap count.',
  summary: 'Clap a post',
  icon: 'hand-metal',
  group: 'Interactions',
  input: z.object({
    post_id: z.string().describe('Medium post ID to clap'),
    count: z.number().int().min(1).max(50).optional().describe('Number of claps to add (default 1, max 50)'),
  }),
  output: z.object({
    post_id: z.string().describe('Post ID'),
    clap_count: z.number().describe('Updated total clap count'),
    voter_count: z.number().describe('Updated total voter count'),
  }),
  handle: async params => {
    const viewerId = getViewerId();
    const numClaps = params.count ?? 1;
    const data = await gql<ClapData>(
      'ClapMutation',
      `mutation ClapMutation($targetPostId: ID!, $numClaps: Int!, $userId: ID!) {
        clap(targetPostId: $targetPostId, numClaps: $numClaps, userId: $userId) {
          id clapCount voterCount
        }
      }`,
      { targetPostId: params.post_id, numClaps, userId: viewerId },
      true,
    );
    return {
      post_id: data.clap?.id ?? params.post_id,
      clap_count: data.clap?.clapCount ?? 0,
      voter_count: data.clap?.voterCount ?? 0,
    };
  },
});
