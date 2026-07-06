import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const voteExpert = defineTool({
  name: 'vote_expert',
  displayName: 'Vote Expert',
  description: 'Upvote or remove a vote from an AI expert/agent.',
  summary: 'Vote on an expert',
  icon: 'thumbs-up',
  group: 'Experts',
  input: z.object({
    id: z.number().describe('Expert ID'),
    vote_status: z.number().int().describe('Vote status (1=upvote, 0=remove vote)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the vote was successful'),
  }),
  handle: async params => {
    await apiPost('/matrix/api/v1/expert/vote', { id: params.id, vote_status: params.vote_status });
    return { success: true };
  },
});
