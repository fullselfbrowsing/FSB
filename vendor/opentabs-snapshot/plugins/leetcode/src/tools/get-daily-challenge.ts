import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawDailyChallenge, dailyChallengeSchema, mapDailyChallenge } from './schemas.js';

export const getDailyChallenge = defineTool({
  name: 'get_daily_challenge',
  displayName: 'Get Daily Challenge',
  description: 'Get today daily coding challenge question including the date, link, and full problem metadata.',
  summary: "Get today's daily challenge",
  icon: 'calendar-check',
  group: 'Problems',
  input: z.object({}),
  output: z.object({ challenge: dailyChallengeSchema }),
  handle: async () => {
    const data = await graphql<{
      activeDailyCodingChallengeQuestion: RawDailyChallenge;
    }>(
      `query questionOfToday {
				activeDailyCodingChallengeQuestion {
					date link
					question {
						acRate difficulty freqBar
						frontendQuestionId: questionFrontendId
						isFavor paidOnly: isPaidOnly status title titleSlug
						topicTags { name slug }
						hasSolution hasVideoSolution
					}
				}
			}`,
    );
    return {
      challenge: mapDailyChallenge(data.activeDailyCodingChallengeQuestion ?? {}),
    };
  },
});
