import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawJobDetail, jobDetailSchema, mapJobDetail } from './schemas.js';

export const getJob = defineTool({
  name: 'get_job',
  displayName: 'Get Job',
  description:
    'Get detailed information about a job by project slug and job number. Returns status, timing, duration, parallelism, and web URL.',
  summary: 'Get job details',
  icon: 'box',
  group: 'Jobs',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    job_number: z.number().int().describe('Job number within the project'),
  }),
  output: z.object({ job: jobDetailSchema }),
  handle: async ({ project_slug, job_number }) => {
    const data = await api<RawJobDetail>(`/project/${project_slug}/job/${job_number}`);
    return { job: mapJobDetail(data) };
  },
});
