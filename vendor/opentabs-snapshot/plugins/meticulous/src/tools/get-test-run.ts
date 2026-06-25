import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { testRunSchema, mapTestRun } from './schemas.js';

export const getTestRun = defineTool({
  name: 'get_test_run',
  displayName: 'Get Test Run',
  description:
    'Get detailed information about a test run including status, statistics, CI context, PR details, and a link to the Meticulous web UI for visual debugging. The test run ID can be found in the Meticulous URL or from project details.',
  summary: 'Get test run details',
  icon: 'play-circle',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
  }),
  output: z.object({
    test_run: testRunSchema,
    web_url: z.string().describe('URL to view the test run in the Meticulous web UI'),
  }),
  handle: async ({ test_run_id }) => {
    const data = await graphql<{
      testRun: Record<string, unknown> & {
        project?: { name?: string; organization?: { name?: string } };
      };
    }>(queries.GET_TEST_RUN, { testRunId: test_run_id });

    const orgName = data.testRun.project?.organization?.name ?? '';
    const projName = data.testRun.project?.name ?? '';
    const webUrl = `https://app.meticulous.ai/projects/${orgName}/${projName}/test-runs/${test_run_id}`;

    return {
      test_run: mapTestRun(data.testRun),
      web_url: webUrl,
    };
  },
});
