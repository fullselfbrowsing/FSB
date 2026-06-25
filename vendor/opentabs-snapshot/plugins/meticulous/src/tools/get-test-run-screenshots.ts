import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import {
  diffResultSchema,
  replayInfoSchema,
  screenshotSchema,
  mapDiffResult,
  mapReplayInfo,
  mapScreenshot,
} from './schemas.js';

export const getTestRunScreenshots = defineTool({
  name: 'get_test_run_screenshots',
  displayName: 'Get Test Run Screenshots',
  description:
    'Get screenshot diffs and test case screenshots for a test run. Each diff includes head/base replay info and screenshot comparison URLs (base image, head image, diff image).',
  summary: 'Get test run screenshot diffs',
  icon: 'image',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    replay_diff_limit: z.number().optional().default(50).describe('Max replay diffs to return'),
    replay_diff_offset: z.number().optional().default(0).describe('Offset for replay diffs pagination'),
    test_case_limit: z.number().optional().default(50).describe('Max test case results to return'),
    test_case_offset: z.number().optional().default(0).describe('Offset for test case pagination'),
  }),
  output: z.object({
    diffs: z.array(
      z.object({
        replay_diff_id: z.string().describe('Replay diff ID'),
        head_replay: replayInfoSchema.describe('Head (actual) replay'),
        base_replay: replayInfoSchema.describe('Base (expected) replay'),
        screenshot_diffs: z.array(diffResultSchema),
      }),
    ),
    test_case_screenshots: z.array(
      z.object({
        replay_id: z.string().describe('Replay ID'),
        replay_status: z.string().nullable().describe('Replay status'),
        replay_accurate: z.boolean().nullable().describe('Whether replay was accurate'),
        app_url: z.string().nullable().describe('Application URL'),
        session_id: z.string().nullable().describe('Source session ID'),
        screenshots: z.array(screenshotSchema),
      }),
    ),
  }),
  handle: async ({ test_run_id, replay_diff_limit, replay_diff_offset, test_case_limit, test_case_offset }) => {
    const data = await graphql<{
      testRun: {
        replayDiffs: Array<{
          id: string;
          headReplay: Record<string, unknown>;
          baseReplay: Record<string, unknown>;
          screenshotDiffResults: Array<Record<string, unknown>>;
        }>;
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
    }>(queries.GET_TEST_RUN_SCREENSHOTS, {
      testRunId: test_run_id,
      replayDiffLimit: replay_diff_limit,
      replayDiffOffset: replay_diff_offset,
      testCaseResultLimit: test_case_limit,
      testCaseResultOffset: test_case_offset,
    });

    return {
      diffs: (data.testRun.replayDiffs ?? []).map(rd => ({
        replay_diff_id: rd.id,
        head_replay: mapReplayInfo(rd.headReplay ?? {}),
        base_replay: mapReplayInfo(rd.baseReplay ?? {}),
        screenshot_diffs: (rd.screenshotDiffResults ?? []).map(mapDiffResult),
      })),
      test_case_screenshots: (data.testRun.testCaseResults ?? []).map(tc => ({
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
