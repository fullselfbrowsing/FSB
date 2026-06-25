import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { coverageSchema, testRunSchema, mapCoverage, mapTestRun } from './schemas.js';

export const getTestRunCoverage = defineTool({
  name: 'get_test_run_coverage',
  displayName: 'Get Test Run Coverage',
  description:
    'Get screenshot coverage data for a test run. Shows which routes have diffs, which were compared without diffs, and which were not compared. Use category filter to limit output size (defaults to with_diffs only). Use route_filter to search for specific routes.',
  summary: 'Get test run coverage',
  icon: 'shield-check',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    pr_mode: z.boolean().optional().default(true).describe('Whether to use PR mode for coverage calculation'),
    replay_id: z.string().optional().describe('Optional replay ID to scope coverage to'),
    category: z
      .enum(['with_diffs', 'without_diffs', 'not_compared', 'all'])
      .optional()
      .default('with_diffs')
      .describe('Coverage category to return (defaults to with_diffs to limit response size)'),
    route_filter: z.string().optional().describe('Filter routes by substring match on route URL or group'),
    limit: z.number().optional().default(50).describe('Max routes to return per category'),
  }),
  output: z.object({
    test_run: testRunSchema,
    coverage: z.object({
      with_diffs: z.array(coverageSchema).describe('Routes with screenshot diffs'),
      without_diffs: z.array(coverageSchema).describe('Routes compared but without diffs'),
      not_compared: z.array(coverageSchema).describe('Routes not compared'),
      num_unmapped_files: z.number().describe('Number of unmapped source files'),
      total_with_diffs: z.number().describe('Total routes with diffs (before filtering)'),
      total_without_diffs: z.number().describe('Total routes without diffs (before filtering)'),
      total_not_compared: z.number().describe('Total routes not compared (before filtering)'),
    }),
  }),
  handle: async ({ test_run_id, pr_mode, replay_id, category, route_filter, limit }) => {
    const data = await graphql<{
      testRun: Record<string, unknown> & {
        coverage: {
          screenshotsComparedWithDiffs: Array<Record<string, unknown>>;
          screenshotsComparedButWithoutDiffs: Array<Record<string, unknown>>;
          screenshotsNotCompared: Array<Record<string, unknown>>;
          numUnmappedFiles: number;
        };
      };
    }>(queries.GET_TEST_RUN_COVERAGE, { testRunId: test_run_id, prMode: pr_mode, replayId: replay_id });

    const cov = data.testRun.coverage;

    const filterRoutes = (routes: Array<Record<string, unknown>>) => {
      let mapped = routes.map(mapCoverage);
      if (route_filter) {
        const f = route_filter.toLowerCase();
        mapped = mapped.filter(
          r => (r.route_url?.toLowerCase().includes(f) ?? false) || (r.route_group?.toLowerCase().includes(f) ?? false),
        );
      }
      return mapped.slice(0, limit);
    };

    const allWithDiffs = cov.screenshotsComparedWithDiffs ?? [];
    const allWithoutDiffs = cov.screenshotsComparedButWithoutDiffs ?? [];
    const allNotCompared = cov.screenshotsNotCompared ?? [];

    return {
      test_run: mapTestRun(data.testRun as Parameters<typeof mapTestRun>[0]),
      coverage: {
        with_diffs: category === 'all' || category === 'with_diffs' ? filterRoutes(allWithDiffs) : [],
        without_diffs: category === 'all' || category === 'without_diffs' ? filterRoutes(allWithoutDiffs) : [],
        not_compared: category === 'all' || category === 'not_compared' ? filterRoutes(allNotCompared) : [],
        num_unmapped_files: cov.numUnmappedFiles ?? 0,
        total_with_diffs: allWithDiffs.length,
        total_without_diffs: allWithoutDiffs.length,
        total_not_compared: allNotCompared.length,
      },
    };
  },
});
