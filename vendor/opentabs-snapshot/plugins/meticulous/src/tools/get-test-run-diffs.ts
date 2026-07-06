import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { diffResultSchema, replayInfoSchema, mapDiffResult, mapReplayInfo } from './schemas.js';

export const getTestRunDiffs = defineTool({
  name: 'get_test_run_diffs',
  displayName: 'Get Test Run Diffs',
  description:
    'Get replay diffs for a test run. Each diff compares a head replay against a base replay. Set only_with_screenshot_diffs=true to skip diffs that have no visual differences (many diffs are structural-only with empty screenshot_diffs). Use compare_replays with the base_replay.id to see full comparison details including screenshots.',
  summary: 'Get replay diffs for a test run',
  icon: 'diff',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    only_with_screenshot_diffs: z
      .boolean()
      .optional()
      .default(false)
      .describe('Only return diffs that have actual visual screenshot differences'),
    limit: z.number().optional().default(100).describe('Max results to return'),
    offset: z.number().optional().default(0).describe('Offset for pagination'),
  }),
  output: z.object({
    total_fetched: z.number().describe('Total diffs fetched from API before filtering'),
    diffs: z.array(
      z.object({
        replay_diff_id: z.string().describe('Replay diff ID'),
        head_replay: replayInfoSchema.describe('Head (actual) replay'),
        base_replay: replayInfoSchema.describe('Base (expected) replay'),
        has_screenshot_diffs: z.boolean().describe('Whether this diff has visual screenshot differences'),
        screenshot_diff_count: z.number().describe('Number of screenshot diffs'),
        screenshot_diffs: z.array(diffResultSchema),
      }),
    ),
  }),
  handle: async ({ test_run_id, only_with_screenshot_diffs, limit, offset }) => {
    const data = await graphql<{
      testRun: {
        replayDiffs: Array<{
          id: string;
          headReplay: Record<string, unknown>;
          baseReplay: Record<string, unknown>;
          screenshotDiffResults: Array<Record<string, unknown>>;
        }>;
      };
    }>(queries.GET_TEST_RUN_DIFFS, { testRunId: test_run_id, limit, offset });

    const allDiffs = (data.testRun.replayDiffs ?? []).map(rd => {
      const diffs = (rd.screenshotDiffResults ?? []).map(mapDiffResult);
      return {
        replay_diff_id: rd.id,
        head_replay: mapReplayInfo(rd.headReplay ?? {}),
        base_replay: mapReplayInfo(rd.baseReplay ?? {}),
        has_screenshot_diffs: diffs.length > 0,
        screenshot_diff_count: diffs.length,
        screenshot_diffs: diffs,
      };
    });

    const filtered = only_with_screenshot_diffs ? allDiffs.filter(d => d.has_screenshot_diffs) : allDiffs;

    return {
      total_fetched: allDiffs.length,
      diffs: filtered,
    };
  },
});
