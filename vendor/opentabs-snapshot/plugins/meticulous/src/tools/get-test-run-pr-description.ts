import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';

export const getTestRunPrDescription = defineTool({
  name: 'get_test_run_pr_description',
  displayName: 'Get Test Run PR Description',
  description: 'Get the pull request description associated with a test run.',
  summary: 'Get PR description for a test run',
  icon: 'file-text',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
  }),
  output: z.object({
    test_run_id: z.string(),
    pr_description: z.string().nullable().describe('Pull request description text'),
  }),
  handle: async ({ test_run_id }) => {
    const data = await graphql<{ testRun: { id: string; pullRequest: { prDescription: string | null } | null } }>(
      queries.GET_TEST_RUN_PR_DESCRIPTION,
      { testRunId: test_run_id },
    );
    return {
      test_run_id: data.testRun.id,
      pr_description: data.testRun.pullRequest?.prDescription ?? null,
    };
  },
});
