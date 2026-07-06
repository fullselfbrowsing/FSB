import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { screenshotSchema, mapScreenshot } from './schemas.js';

export const getTestRunTestCases = defineTool({
  name: 'get_test_run_test_cases',
  displayName: 'Get Test Run Test Cases',
  description:
    'Get test case results for a test run. Each test case has a head replay with status and accuracy info. A replay with is_accurate=false means the replay diverged from the original session (non-deterministic behavior, flaky). Note: test cases do not have a base replay — they represent individual session replays, not diff comparisons. For visual diffs, use get_test_run_diffs instead.',
  summary: 'Get test case results',
  icon: 'list-checks',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    include_passes: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include passing test cases (defaults to failures only)'),
    limit: z.number().optional().default(100).describe('Max results to return'),
    offset: z.number().optional().default(0).describe('Offset for pagination'),
  }),
  output: z.object({
    test_cases: z.array(
      z.object({
        replay_id: z.string().describe('Replay ID — use with get_replay for full details'),
        replay_status: z
          .string()
          .nullable()
          .describe('Replay execution status (Success = completed, may still be inaccurate)'),
        replay_accurate: z
          .boolean()
          .nullable()
          .describe('Whether the replay accurately reproduced the session. false = flaky/non-deterministic failure'),
        app_url: z.string().nullable().describe('Application URL used for replay'),
        session_id: z
          .string()
          .nullable()
          .describe('Source session ID — use with get_session_events to see original user interactions'),
        screenshots: z.array(screenshotSchema),
      }),
    ),
  }),
  handle: async ({ test_run_id, include_passes, limit, offset }) => {
    const data = await graphql<{
      testRun: {
        testCaseResults: Array<{
          headReplay: {
            id: string;
            status?: string;
            isAccurate?: boolean;
            parameters?: { appUrl?: string };
            screenshotsData: Array<Record<string, unknown>>;
          };
          session?: { id?: string };
        }>;
      };
    }>(queries.GET_TEST_RUN_TEST_CASES, {
      testRunId: test_run_id,
      limit,
      offset,
      excludePasses: !include_passes,
    });

    return {
      test_cases: (data.testRun.testCaseResults ?? []).map(tc => ({
        replay_id: tc.headReplay?.id ?? '',
        replay_status: tc.headReplay?.status ?? null,
        replay_accurate: tc.headReplay?.isAccurate ?? null,
        app_url: tc.headReplay?.parameters?.appUrl ?? null,
        session_id: tc.session?.id ?? null,
        screenshots: (tc.headReplay?.screenshotsData ?? []).map(mapScreenshot),
      })),
    };
  },
});
