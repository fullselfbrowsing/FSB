import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { cronJobSchema, mapCronJob } from './schemas.js';
import type { RawCronJob } from './schemas.js';

export const getCronJob = defineTool({
  name: 'get_cron_job',
  displayName: 'Get Scheduled Job',
  description: 'Get detailed information about a specific scheduled (cron) job by its ID.',
  summary: 'Get scheduled job details',
  icon: 'clock',
  group: 'Schedules',
  input: z.object({
    id: z.string().describe('Cron job ID'),
  }),
  output: cronJobSchema,
  handle: async params => {
    const data = await apiPost<{
      cron_job: RawCronJob;
      base_resp: unknown;
    }>('/matrix/api/v1/cron/get_job', {
      job_id: Number(params.id),
    });
    return mapCronJob(data.cron_job);
  },
});
