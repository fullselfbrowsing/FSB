import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, mutations } from '../meticulous-api.js';

export const checkForFlakes = defineTool({
  name: 'check_for_flakes',
  displayName: 'Check for Flakes',
  description:
    'Trigger a flake detection check for a test run. Re-runs failing tests multiple times to determine if failures are flaky (non-deterministic).',
  summary: 'Check for flaky tests',
  icon: 'refresh-cw',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    rerun_count: z.number().optional().default(3).describe('Number of times to re-run tests for flake detection'),
  }),
  output: z.object({
    id: z.string().nullable().describe('ID of the flake check run'),
  }),
  handle: async ({ test_run_id, rerun_count }) => {
    const data = await graphql<{ checkForFlakes: { id: string } }>(mutations.CHECK_FOR_FLAKES, {
      testRunId: test_run_id,
      rerunTestsNTimes: rerun_count,
    });
    return { id: data.checkForFlakes?.id ?? null };
  },
});
