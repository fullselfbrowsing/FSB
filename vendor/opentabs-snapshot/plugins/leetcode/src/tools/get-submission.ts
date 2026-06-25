import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawSubmissionDetail, mapSubmissionDetail, submissionDetailSchema } from './schemas.js';

export const getSubmission = defineTool({
  name: 'get_submission',
  displayName: 'Get Submission',
  description:
    'Get full details of a submission including source code, runtime/memory stats with percentiles, language, and any errors.',
  summary: 'Get submission details by ID',
  icon: 'file-code',
  group: 'Submissions',
  input: z.object({
    submissionId: z.number().int().describe('Submission ID (numeric)'),
  }),
  output: z.object({ submission: submissionDetailSchema }),
  handle: async params => {
    const data = await graphql<{ submissionDetails: RawSubmissionDetail }>(
      `query submissionDetails($submissionId: Int!) {
				submissionDetails(submissionId: $submissionId) {
					runtime runtimeDisplay runtimePercentile
					memory memoryDisplay memoryPercentile
					code timestamp statusCode
					lang { name verboseName }
					question { questionId title titleSlug }
					notes
					topicTags { slug name }
					runtimeError compileError lastTestcase
				}
			}`,
      { submissionId: params.submissionId },
    );
    return { submission: mapSubmissionDetail(data.submissionDetails ?? {}) };
  },
});
