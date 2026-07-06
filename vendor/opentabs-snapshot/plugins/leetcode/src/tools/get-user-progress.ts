import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawQuestionProgress, mapQuestionProgress, questionProgressSchema } from './schemas.js';

export const getUserProgress = defineTool({
  name: 'get_user_progress',
  displayName: 'Get User Progress',
  description:
    'Get question solving progress for a user broken down by difficulty (Easy, Medium, Hard). Shows accepted, failed, and untouched counts.',
  summary: 'Get solving progress by difficulty',
  icon: 'bar-chart-3',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username (user slug)'),
  }),
  output: z.object({ progress: questionProgressSchema }),
  handle: async params => {
    const data = await graphql<{
      userProfileUserQuestionProgressV2: RawQuestionProgress;
    }>(
      `query userProfileUserQuestionProgressV2($userSlug: String!) {
				userProfileUserQuestionProgressV2(userSlug: $userSlug) {
					numAcceptedQuestions { difficulty count }
					numFailedQuestions { difficulty count }
					numUntouchedQuestions { difficulty count }
				}
			}`,
      { userSlug: params.username },
    );
    return {
      progress: mapQuestionProgress(data.userProfileUserQuestionProgressV2 ?? {}),
    };
  },
});
