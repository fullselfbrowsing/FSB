import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

const tagProblemCountSchema = z.object({
  tagName: z.string().describe('Topic tag name'),
  tagSlug: z.string().describe('Topic tag slug'),
  problemsSolved: z.number().describe('Number of problems solved with this tag'),
});

export const getUserSkillStats = defineTool({
  name: 'get_user_skill_stats',
  displayName: 'Get User Skill Stats',
  description:
    'Get a user skill/topic tag statistics showing how many problems they have solved in each topic area, split by advanced, intermediate, and fundamental levels.',
  summary: 'Get topic-based solving stats',
  icon: 'brain',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username'),
  }),
  output: z.object({
    advanced: z.array(tagProblemCountSchema).describe('Advanced-level topic stats'),
    intermediate: z.array(tagProblemCountSchema).describe('Intermediate-level topic stats'),
    fundamental: z.array(tagProblemCountSchema).describe('Fundamental-level topic stats'),
  }),
  handle: async params => {
    const data = await graphql<{
      matchedUser: {
        tagProblemCounts?: {
          advanced?: Array<{
            tagName?: string;
            tagSlug?: string;
            problemsSolved?: number;
          }>;
          intermediate?: Array<{
            tagName?: string;
            tagSlug?: string;
            problemsSolved?: number;
          }>;
          fundamental?: Array<{
            tagName?: string;
            tagSlug?: string;
            problemsSolved?: number;
          }>;
        };
      };
    }>(
      `query skillStats($username: String!) {
				matchedUser(username: $username) {
					tagProblemCounts {
						advanced { tagName tagSlug problemsSolved }
						intermediate { tagName tagSlug problemsSolved }
						fundamental { tagName tagSlug problemsSolved }
					}
				}
			}`,
      { username: params.username },
    );

    const tpc = data.matchedUser?.tagProblemCounts;
    const mapTags = (items?: Array<{ tagName?: string; tagSlug?: string; problemsSolved?: number }>) =>
      (items ?? []).map(t => ({
        tagName: t.tagName ?? '',
        tagSlug: t.tagSlug ?? '',
        problemsSolved: t.problemsSolved ?? 0,
      }));

    return {
      advanced: mapTags(tpc?.advanced),
      intermediate: mapTags(tpc?.intermediate),
      fundamental: mapTags(tpc?.fundamental),
    };
  },
});
