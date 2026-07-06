import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { cronJobSchema, mapCronJob } from './schemas.js';
import type { RawCronJob } from './schemas.js';

export const updateCronJob = defineTool({
  name: 'update_cron_job',
  displayName: 'Update Scheduled Job',
  description:
    'Update an existing scheduled (cron) job. Only provided fields are changed; omitted fields remain unchanged.',
  summary: 'Update a scheduled job',
  icon: 'pencil',
  group: 'Schedules',
  input: z.object({
    id: z.string().describe('Cron job ID to update'),
    name: z.string().optional().describe('New name for the job'),
    prompt: z.string().optional().describe('New prompt to execute'),
    cron_expression: z.string().optional().describe('New cron expression e.g. "0 9 * * *"'),
    status: z.number().int().optional().describe('Job status (0=paused, 1=active)'),
  }),
  output: cronJobSchema,
  handle: async params => {
    const data = await apiPost<{
      cron_job: RawCronJob;
      base_resp: unknown;
    }>('/matrix/api/v1/cron/update_job', {
      job_id: Number(params.id),
      ...(params.name != null && { job_title: params.name }),
      ...(params.prompt != null && { job_instruction: params.prompt }),
      ...(params.cron_expression != null && { cron_expression: params.cron_expression }),
      ...(params.status != null && { status: params.status }),
    });
    return mapCronJob(data.cron_job);
  },
});
