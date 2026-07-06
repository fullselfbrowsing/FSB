import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getSimilarProblems = defineTool({
  name: 'get_similar_problems',
  displayName: 'Get Similar Problems',
  description:
    'Get problems similar to a given problem. Returns a list of related problems with their difficulty and paid-only status.',
  summary: 'Find similar problems',
  icon: 'git-branch',
  group: 'Problems',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
  }),
  output: z.object({
    similar: z.array(
      z.object({
        title: z.string().describe('Problem title'),
        titleSlug: z.string().describe('Problem URL slug'),
        difficulty: z.string().describe('Difficulty level'),
        isPaidOnly: z.boolean().describe('Whether this requires premium'),
      }),
    ),
  }),
  handle: async params => {
    const data = await graphql<{
      question: { similarQuestions?: string };
    }>(
      `query similarQuestions($titleSlug: String!) {
				question(titleSlug: $titleSlug) { similarQuestions }
			}`,
      { titleSlug: params.titleSlug },
    );

    let parsed: Array<{
      title?: string;
      titleSlug?: string;
      difficulty?: string;
      isPaidOnly?: boolean;
    }> = [];
    try {
      parsed = JSON.parse(data.question?.similarQuestions ?? '[]');
    } catch {
      parsed = [];
    }

    return {
      similar: parsed.map(s => ({
        title: s.title ?? '',
        titleSlug: s.titleSlug ?? '',
        difficulty: s.difficulty ?? '',
        isPaidOnly: s.isPaidOnly ?? false,
      })),
    };
  },
});
