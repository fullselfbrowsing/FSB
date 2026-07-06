import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { pollSubmissionResult, rest } from '../leetcode-api.js';
import { type RawRunCodeResult, mapRunCodeResult, runCodeResultSchema } from './schemas.js';

export const runCode = defineTool({
  name: 'run_code',
  displayName: 'Run Code',
  description:
    'Run code against test cases for a LeetCode problem without submitting. Returns the output, expected output, runtime, memory, and whether the answer is correct. Use this to test solutions before submitting.',
  summary: 'Run code against test cases',
  icon: 'play',
  group: 'Code',
  input: z.object({
    titleSlug: z.string().describe('Problem URL slug (e.g., "two-sum")'),
    questionId: z.string().describe('Question ID (numeric string, e.g., "1")'),
    lang: z.string().describe('Language slug (e.g., "python3", "java", "cpp", "javascript", "typescript")'),
    typedCode: z.string().describe('Source code to run'),
    dataInput: z.string().describe('Test case input (newline-separated for multiple inputs, e.g., "[2,7,11,15]\\n9")'),
  }),
  output: z.object({ result: runCodeResultSchema }),
  handle: async (params, context?) => {
    context?.reportProgress({ progress: 1, total: 3, message: 'Submitting code to judge...' });

    const runResponse = await rest<{ interpret_id: string }>(`/problems/${params.titleSlug}/interpret_solution/`, {
      body: {
        lang: params.lang,
        question_id: params.questionId,
        typed_code: params.typedCode,
        data_input: params.dataInput,
      },
    });

    context?.reportProgress({ progress: 2, total: 3, message: 'Waiting for results...' });

    const result = await pollSubmissionResult<RawRunCodeResult>(runResponse.interpret_id);

    return { result: mapRunCodeResult(result) };
  },
});
