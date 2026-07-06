import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { pollSubmissionResult, rest } from '../leetcode-api.js';
import { type RawSubmitResult, mapSubmitResult, submitResultSchema } from './schemas.js';

export const submitCode = defineTool({
  name: 'submit_code',
  displayName: 'Submit Code',
  description:
    'Submit a solution for a LeetCode problem. Runs against all test cases and returns the verdict including status, runtime/memory percentiles, and any errors. Use run_code first to test your solution.',
  summary: 'Submit a solution for judging',
  icon: 'send',
  group: 'Code',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
    questionId: z.string().describe('Question ID (numeric string, e.g., "1")'),
    lang: z.string().describe('Language slug (e.g., "python3", "java", "cpp", "javascript", "typescript")'),
    typedCode: z.string().describe('Source code to submit'),
  }),
  output: z.object({ result: submitResultSchema }),
  handle: async (params, context?) => {
    context?.reportProgress({ progress: 1, total: 3, message: 'Submitting solution...' });

    const submitResponse = await rest<{ submission_id: number }>(`/problems/${params.titleSlug}/submit/`, {
      body: {
        lang: params.lang,
        question_id: params.questionId,
        typed_code: params.typedCode,
      },
    });

    context?.reportProgress({ progress: 2, total: 3, message: 'Judging solution...' });

    const result = await pollSubmissionResult<RawSubmitResult>(String(submitResponse.submission_id));

    return { result: mapSubmitResult(result) };
  },
});
