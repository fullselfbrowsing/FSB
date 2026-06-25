import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getProblemStats = defineTool({
  name: 'get_problem_stats',
  displayName: 'Get Problem Stats',
  description:
    'Get statistics for a problem including total accepted/submitted counts, acceptance rate, and likes/dislikes. The stats field is a JSON string with totalAccepted, totalSubmission, totalAcceptedRaw, totalSubmissionRaw, and acRate.',
  summary: 'Get problem acceptance stats',
  icon: 'pie-chart',
  group: 'Problems',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
  }),
  output: z.object({
    questionId: z.string().describe('Question ID'),
    title: z.string().describe('Problem title'),
    difficulty: z.string().describe('Difficulty level'),
    likes: z.number().describe('Number of likes'),
    dislikes: z.number().describe('Number of dislikes'),
    stats: z
      .string()
      .describe('JSON string with totalAccepted, totalSubmission, totalAcceptedRaw, totalSubmissionRaw, acRate'),
  }),
  handle: async params => {
    const data = await graphql<{
      question: {
        questionId?: string;
        title?: string;
        difficulty?: string;
        likes?: number;
        dislikes?: number;
        stats?: string;
      };
    }>(
      `query questionStats($titleSlug: String!) {
				question(titleSlug: $titleSlug) {
					questionId title difficulty likes dislikes stats
				}
			}`,
      { titleSlug: params.titleSlug },
    );

    const q = data.question ?? {};
    return {
      questionId: q.questionId ?? '',
      title: q.title ?? '',
      difficulty: q.difficulty ?? '',
      likes: q.likes ?? 0,
      dislikes: q.dislikes ?? 0,
      stats: q.stats ?? '{}',
    };
  },
});
