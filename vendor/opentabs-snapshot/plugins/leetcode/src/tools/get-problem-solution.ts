import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';

export const getProblemSolution = defineTool({
  name: 'get_problem_solution',
  displayName: 'Get Problem Solution',
  description:
    'Get the official editorial/solution article for a problem. Returns the solution content in HTML format. Not all problems have official solutions.',
  summary: 'Get the official solution article',
  icon: 'lightbulb',
  group: 'Problems',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
  }),
  output: z.object({
    id: z.string().describe('Solution article ID'),
    title: z.string().describe('Solution article title'),
    content: z.string().describe('Solution content in HTML'),
    contentTypeId: z.string().describe('Content type'),
    paidOnly: z.boolean().describe('Whether this solution requires premium'),
    hasVideoSolution: z.boolean().describe('Whether a video solution exists'),
  }),
  handle: async params => {
    const data = await graphql<{
      question: {
        solution?: {
          id?: string;
          title?: string;
          content?: string;
          contentTypeId?: string;
          paidOnly?: boolean;
          hasVideoSolution?: boolean;
        };
      };
    }>(
      `query officialSolution($titleSlug: String!) {
				question(titleSlug: $titleSlug) {
					solution {
						id title content contentTypeId paidOnly hasVideoSolution
					}
				}
			}`,
      { titleSlug: params.titleSlug },
    );

    const s = data.question?.solution;
    return {
      id: s?.id ?? '',
      title: s?.title ?? '',
      content: s?.content ?? '',
      contentTypeId: s?.contentTypeId ?? '',
      paidOnly: s?.paidOnly ?? false,
      hasVideoSolution: s?.hasVideoSolution ?? false,
    };
  },
});
