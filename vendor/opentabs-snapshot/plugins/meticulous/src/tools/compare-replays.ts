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

export const compareReplays = defineTool({
  name: 'compare_replays',
  displayName: 'Compare Replays',
  description:
    'Compare a head replay against its base replay within a test run. Returns screenshot diffs with base/head/diff image URLs, divergences, and replay metadata. Use the base_replay_id from get_test_run_diffs results.',
  summary: 'Compare replays in a test run',
  icon: 'columns',
  group: 'Replays',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    base_replay_id: z.string().describe('Base replay ID (from get_test_run_diffs base_replay.id)'),
  }),
  output: z.object({
    diff_id: z.string().nullable().describe('Replay diff ID'),
    divergences: z
      .array(z.string())
      .nullable()
      .describe('Structural divergences between replays (list of divergence descriptions)'),
    head_replay: replayInfoSchema.nullable().describe('Head replay info'),
    base_replay: replayInfoSchema.nullable().describe('Base replay info'),
    head_screenshots: z.array(screenshotSchema).describe('Head replay screenshots'),
    base_screenshots: z.array(screenshotSchema).describe('Base replay screenshots'),
    screenshot_diffs: z.array(diffResultSchema).describe('Visual differences between screenshots'),
  }),
  handle: async ({ test_run_id, base_replay_id }) => {
    const data = await graphql<{
      testRun: {
        replayDiff: {
          id: string;
          divergences: unknown;
          headReplay: Record<string, unknown> & { screenshotsData: Array<Record<string, unknown>> };
          baseReplay: Record<string, unknown> & { screenshotsData: Array<Record<string, unknown>> };
          screenshotDiffResults: Array<Record<string, unknown>>;
        } | null;
      };
    }>(queries.GET_COMPARE_REPLAYS, { testRunId: test_run_id, baseReplayId: base_replay_id });

    const diff = data.testRun.replayDiff;
    if (!diff) {
      return {
        diff_id: null,
        divergences: null,
        head_replay: null,
        base_replay: null,
        head_screenshots: [],
        base_screenshots: [],
        screenshot_diffs: [],
      };
    }

    return {
      diff_id: diff.id,
      divergences: Array.isArray(diff.divergences) ? (diff.divergences as string[]) : null,
      head_replay: mapReplayInfo(diff.headReplay as Parameters<typeof mapReplayInfo>[0]),
      base_replay: mapReplayInfo(diff.baseReplay as Parameters<typeof mapReplayInfo>[0]),
      head_screenshots: (diff.headReplay.screenshotsData ?? []).map(mapScreenshot),
      base_screenshots: (diff.baseReplay.screenshotsData ?? []).map(mapScreenshot),
      screenshot_diffs: (diff.screenshotDiffResults ?? []).map(mapDiffResult),
    };
  },
});
