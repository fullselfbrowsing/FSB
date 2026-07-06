import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../circleci-api.js';

export const cancelJob = defineTool({
  name: 'cancel_job',
  displayName: 'Cancel Job',
  description: 'Cancel a running job by project slug and job number.',
  summary: 'Cancel a running job',
  icon: 'circle-x',
  group: 'Jobs',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    job_number: z.number().int().describe('Job number within the project'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async ({ project_slug, job_number }) => {
    await apiVoid(`/project/${project_slug}/job/${job_number}/cancel`);
    return { success: true };
  },
});
