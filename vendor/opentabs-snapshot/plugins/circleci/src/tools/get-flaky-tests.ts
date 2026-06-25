import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawFlakyTest, flakyTestSchema, mapFlakyTest } from './schemas.js';

export const getFlakyTests = defineTool({
  name: 'get_flaky_tests',
  displayName: 'Get Flaky Tests',
  description:
    'Get flaky tests detected in a project. Returns test names, how many times they flaked, and which workflows/jobs they ran in.',
  summary: 'Get flaky tests in a project',
  icon: 'alert-triangle',
  group: 'Insights',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
  }),
  output: z.object({
    flaky_tests: z.array(flakyTestSchema).describe('List of flaky tests'),
  }),
  handle: async ({ project_slug }) => {
    const data = await api<{ flaky_tests?: RawFlakyTest[] }>(`/insights/${project_slug}/flaky-tests`);
    return {
      flaky_tests: (data.flaky_tests ?? []).map(mapFlakyTest),
    };
  },
});
