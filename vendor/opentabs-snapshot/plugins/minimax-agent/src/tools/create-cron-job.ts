import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { cronJobSchema, mapCronJob } from './schemas.js';
import type { RawCronJob } from './schemas.js';

export const createCronJob = defineTool({
  name: 'create_cron_job',
  displayName: 'Create Scheduled Job',
  description: 'Create a new scheduled (cron) job with a name, prompt, and cron expression defining when it runs.',
  summary: 'Create a scheduled job',
  icon: 'plus',
  group: 'Schedules',
  input: z.object({
    name: z.string().describe('Name of the scheduled job'),
    prompt: z.string().describe('Prompt to execute on each run'),
    cron_expression: z.string().describe('Cron expression e.g. "0 9 * * *"'),
  }),
  output: cronJobSchema,
  handle: async params => {
    const data = await apiPost<{
      cron_job: RawCronJob;
      base_resp: unknown;
    }>('/matrix/api/v1/cron/create_job', {
      job_title: params.name,
      job_instruction: params.prompt,
      cron_expression: params.cron_expression,
    });
    return mapCronJob(data.cron_job);
  },
});
