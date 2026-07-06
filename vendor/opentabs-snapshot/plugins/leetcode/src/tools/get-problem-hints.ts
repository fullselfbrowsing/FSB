import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getProblemHints = defineTool({
  name: 'get_problem_hints',
  displayName: 'Get Problem Hints',
  description:
    'Get hints for a LeetCode problem. Returns an array of hint strings that progressively reveal the approach.',
  summary: 'Get hints for a problem',
  icon: 'help-circle',
  group: 'Problems',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
  }),
  output: z.object({
    title: z.string().describe('Problem title'),
    hints: z.array(z.string()).describe('Hints for solving the problem'),
  }),
  handle: async params => {
    const data = await graphql<{
      question: { title?: string; hints?: string[] };
    }>(
      `query questionHints($titleSlug: String!) {
				question(titleSlug: $titleSlug) { title hints }
			}`,
      { titleSlug: params.titleSlug },
    );

    return {
      title: data.question?.title ?? '',
      hints: data.question?.hints ?? [],
    };
  },
});
