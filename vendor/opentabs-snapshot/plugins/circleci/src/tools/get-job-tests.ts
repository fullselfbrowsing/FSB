import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawTest, mapTest, testSchema } from './schemas.js';

export const getJobTests = defineTool({
  name: 'get_job_tests',
  displayName: 'Get Job Tests',
  description: 'Get test metadata for a job. Returns test names, results, run times, and failure messages.',
  summary: 'Get job test results',
  icon: 'test-tube',
  group: 'Jobs',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    job_number: z.number().int().describe('Job number within the project'),
  }),
  output: z.object({
    tests: z.array(testSchema).describe('List of test results'),
    next_page_token: z.string().describe('Token for the next page of results'),
  }),
  handle: async ({ project_slug, job_number }) => {
    const data = await api<Paginated<RawTest>>(`/project/${project_slug}/${job_number}/tests`);
    return {
      tests: (data.items ?? []).map(mapTest),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
