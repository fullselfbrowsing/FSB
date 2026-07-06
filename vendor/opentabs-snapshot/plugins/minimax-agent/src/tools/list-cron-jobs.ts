import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { cronJobSchema, mapCronJob } from './schemas.js';
import type { RawCronJob } from './schemas.js';

export const listCronJobs = defineTool({
  name: 'list_cron_jobs',
  displayName: 'List Scheduled Jobs',
  description:
    'List scheduled (cron) jobs with pagination. Returns job definitions including their schedules and statuses.',
  summary: 'List scheduled jobs',
  icon: 'clock',
  group: 'Schedules',
  input: z.object({
    page_num: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(50).optional().describe('Results per page (default 20)'),
  }),
  output: z.object({
    cron_jobs: z.array(cronJobSchema).describe('List of scheduled jobs'),
    has_more: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const data = await apiPost<{
      cron_jobs: RawCronJob[];
      has_more: boolean;
      base_resp: unknown;
    }>('/matrix/api/v1/cron/list_job', {
      page_num: params.page_num ?? 1,
      page_size: params.page_size ?? 20,
    });
    return {
      cron_jobs: (data.cron_jobs ?? []).map(mapCronJob),
      has_more: data.has_more ?? false,
    };
  },
});
