import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getUserLanguageStats = defineTool({
  name: 'get_user_language_stats',
  displayName: 'Get User Language Stats',
  description:
    'Get the programming languages a user has used for solving problems, with the number of problems solved in each language.',
  summary: 'Get language usage stats',
  icon: 'code-2',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({
    languages: z.array(
      z.object({
        languageName: z.string().describe('Programming language name'),
        problemsSolved: z.number().describe('Number of problems solved in this language'),
      }),
    ),
  }),
  handle: async params => {
    const data = await graphql<{
      matchedUser: {
        languageProblemCount?: Array<{
          languageName?: string;
          problemsSolved?: number;
        }>;
      };
    }>(
      `query languageStats($username: String!) {
				matchedUser(username: $username) {
					languageProblemCount { languageName problemsSolved }
				}
			}`,
      { username: params.username },
    );

    const languages = (data.matchedUser?.languageProblemCount ?? []).map(l => ({
      languageName: l.languageName ?? '',
      problemsSolved: l.problemsSolved ?? 0,
    }));

    return { languages };
  },
});
