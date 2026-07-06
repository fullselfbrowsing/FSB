import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getContestHistory = defineTool({
  name: 'get_contest_history',
  displayName: 'Get Contest History',
  description:
    'Get a user contest participation history. Returns each contest with the rating change, ranking, and whether the user attended.',
  summary: 'Get contest participation history',
  icon: 'history',
  group: 'Contests',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({
    history: z.array(
      z.object({
        attended: z.boolean().describe('Whether the user attended this contest'),
        rating: z.number().describe('Rating after this contest'),
        ranking: z.number().describe('Ranking in this contest'),
        contestTitle: z.string().describe('Contest title'),
        contestStartTime: z.number().describe('Contest start time (Unix timestamp)'),
      }),
    ),
  }),
  handle: async params => {
    const data = await graphql<{
      userContestRankingHistory: Array<{
        attended?: boolean;
        rating?: number;
        ranking?: number;
        contest?: { title?: string; startTime?: number };
      }>;
    }>(
      `query userContestHistory($username: String!) {
				userContestRankingHistory(username: $username) {
					attended rating ranking
					contest { title startTime }
				}
			}`,
      { username: params.username },
    );

    const history = (data.userContestRankingHistory ?? []).map(h => ({
      attended: h.attended ?? false,
      rating: h.rating ?? 0,
      ranking: h.ranking ?? 0,
      contestTitle: h.contest?.title ?? '',
      contestStartTime: h.contest?.startTime ?? 0,
    }));

    return { history };
  },
});
