import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawQuestionDetail, mapQuestionDetail, questionDetailSchema } from './schemas.js';

export const getProblem = defineTool({
  name: 'get_problem',
  displayName: 'Get Problem',
  description:
    'Get full details for a LeetCode problem including description (HTML), difficulty, hints, starter code snippets for all languages, similar questions, and example test cases.',
  summary: 'Get a problem by slug',
  icon: 'file-text',
  group: 'Problems',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum", "add-two-numbers")'),
  }),
  output: z.object({ question: questionDetailSchema }),
  handle: async params => {
    const data = await graphql<{ question: RawQuestionDetail }>(
      `query questionData($titleSlug: String!) {
				question(titleSlug: $titleSlug) {
					questionId questionFrontendId title titleSlug content
					difficulty likes dislikes isLiked isPaidOnly categoryTitle
					acRate status
					topicTags { name slug }
					hints similarQuestions exampleTestcases sampleTestCase
					codeSnippets { lang langSlug code }
				}
			}`,
      { titleSlug: params.titleSlug },
    );
    return { question: mapQuestionDetail(data.question ?? {}) };
  },
});
