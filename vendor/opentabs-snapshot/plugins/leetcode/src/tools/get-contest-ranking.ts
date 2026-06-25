import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawContestRanking, contestRankingSchema, mapContestRanking } from './schemas.js';

export const getContestRanking = defineTool({
  name: 'get_contest_ranking',
  displayName: 'Get Contest Ranking',
  description: 'Get a user contest rating, global ranking, number of contests attended, and top percentage.',
  summary: 'Get contest ranking for a user',
  icon: 'trophy',
  group: 'Contests',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({ ranking: contestRankingSchema }),
  handle: async params => {
    const data = await graphql<{ userContestRanking: RawContestRanking }>(
      `query userContestRankingInfo($username: String!) {
				userContestRanking(username: $username) {
					attendedContestsCount rating globalRanking totalParticipants topPercentage
				}
			}`,
      { username: params.username },
    );
    return { ranking: mapContestRanking(data.userContestRanking ?? {}) };
  },
});
