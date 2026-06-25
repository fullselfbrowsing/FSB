import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawCodeSnippet, codeSnippetSchema, mapCodeSnippet } from './schemas.js';

export const getCodeSnippets = defineTool({
  name: 'get_code_snippets',
  displayName: 'Get Code Snippets',
  description:
    'Get starter code templates for all available languages for a given problem. Returns the function signature and boilerplate for each language.',
  summary: 'Get starter code for all languages',
  icon: 'code',
  group: 'Code',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
  }),
  output: z.object({
    snippets: z.array(codeSnippetSchema),
  }),
  handle: async params => {
    const data = await graphql<{
      question: { codeSnippets?: RawCodeSnippet[] };
    }>(
      `query codeSnippets($titleSlug: String!) {
				question(titleSlug: $titleSlug) {
					codeSnippets { lang langSlug code }
				}
			}`,
      { titleSlug: params.titleSlug },
    );

    return {
      snippets: (data.question?.codeSnippets ?? []).map(mapCodeSnippet),
    };
  },
});
