import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getUserSubmitStats = defineTool({
  name: 'get_user_submit_stats',
  displayName: 'Get User Submit Stats',
  description:
    'Get detailed submission statistics for a user including total submissions, accepted count, and acceptance rate broken down by difficulty.',
  summary: 'Get submission stats by difficulty',
  icon: 'bar-chart',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({
    stats: z.array(
      z.object({
        difficulty: z.string().describe('Difficulty level (All, Easy, Medium, Hard)'),
        count: z.number().describe('Number of accepted submissions'),
        submissions: z.number().describe('Total number of submissions'),
      }),
    ),
  }),
  handle: async params => {
    const data = await graphql<{
      matchedUser: {
        submitStats?: {
          acSubmissionNum?: Array<{
            difficulty?: string;
            count?: number;
            submissions?: number;
          }>;
        };
      };
    }>(
      `query userSubmitStats($username: String!) {
				matchedUser(username: $username) {
					submitStats: submitStatsGlobal {
						acSubmissionNum { difficulty count submissions }
					}
				}
			}`,
      { username: params.username },
    );

    const stats = (data.matchedUser?.submitStats?.acSubmissionNum ?? []).map(s => ({
      difficulty: s.difficulty ?? '',
      count: s.count ?? 0,
      submissions: s.submissions ?? 0,
    }));

    return { stats };
  },
});
