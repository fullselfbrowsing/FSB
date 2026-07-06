import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawSubmission, mapSubmission, submissionSchema } from './schemas.js';

export const listSubmissions = defineTool({
  name: 'list_submissions',
  displayName: 'List Submissions',
  description:
    'List your submissions with pagination. Optionally filter by problem slug. Returns submission ID, status, language, runtime, memory, and timestamp.',
  summary: 'List your submissions',
  icon: 'list',
  group: 'Submissions',
  input: z.object({
    questionSlug: z.string().optional().describe('Filter by problem slug (e.g., "two-sum"). Omit for all submissions.'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    limit: z.number().int().min(1).max(40).optional().describe('Number of submissions to return (default 20, max 40)'),
  }),
  output: z.object({
    submissions: z.array(submissionSchema),
    hasNext: z.boolean().describe('Whether there are more submissions'),
  }),
  handle: async params => {
    const data = await graphql<{
      submissionList: {
        hasNext: boolean;
        submissions: RawSubmission[];
      };
    }>(
      `query submissionList($offset: Int!, $limit: Int!, $questionSlug: String) {
				submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
					lastKey hasNext
					submissions {
						id statusDisplay lang runtime timestamp url isPending title memory titleSlug
					}
				}
			}`,
      {
        offset: params.offset ?? 0,
        limit: params.limit ?? 20,
        questionSlug: params.questionSlug,
      },
    );

    const list = data.submissionList;
    return {
      submissions: (list?.submissions ?? []).map(mapSubmission),
      hasNext: list?.hasNext ?? false,
    };
  },
});
