import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiRaw } from '../gitlab-api.js';

export const getJobLog = defineTool({
  name: 'get_job_log',
  displayName: 'Get Job Log',
  description: 'Get the log (trace) output of a CI/CD job. Returns the raw log text.',
  summary: 'Get the log output of a job',
  icon: 'scroll-text',
  group: 'CI/CD',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    job_id: z.number().int().min(1).describe('Job ID'),
  }),
  output: z.object({
    log: z.string().describe('Raw job log text'),
  }),
  handle: async params => {
    const log = await apiRaw(`/projects/${encodeURIComponent(params.project)}/jobs/${params.job_id}/trace`);
    return { log };
  },
});
