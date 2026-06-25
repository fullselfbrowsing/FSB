import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const executeCronJob = defineTool({
  name: 'execute_cron_job',
  displayName: 'Execute Scheduled Job Now',
  description: 'Immediately execute a scheduled (cron) job, bypassing its normal schedule.',
  summary: 'Run a scheduled job now',
  icon: 'play',
  group: 'Schedules',
  input: z.object({
    id: z.string().describe('Cron job ID to execute'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the execution was triggered'),
  }),
  handle: async params => {
    await apiPost<{
      base_resp: unknown;
    }>('/matrix/api/v1/cron/execute_now', {
      job_id: Number(params.id),
    });
    return { success: true };
  },
});
