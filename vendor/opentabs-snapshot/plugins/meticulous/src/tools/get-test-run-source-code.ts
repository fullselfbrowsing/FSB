import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';

export const getTestRunSourceCode = defineTool({
  name: 'get_test_run_source_code',
  displayName: 'Get Test Run Source Code',
  description: 'Get the source code of a file at the commit of a specific test run.',
  summary: 'Get source code for a test run commit',
  icon: 'file-code',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    path: z.string().describe('File path relative to repository root'),
  }),
  output: z.object({
    test_run_id: z.string(),
    source_code: z.string().nullable().describe('File source code content'),
  }),
  handle: async ({ test_run_id, path }) => {
    const data = await graphql<{ testRun: { id: string; sourceCode: string | null } }>(
      queries.GET_TEST_RUN_SOURCE_CODE,
      { testRunId: test_run_id, path },
    );
    return { test_run_id: data.testRun.id, source_code: data.testRun.sourceCode };
  },
});
