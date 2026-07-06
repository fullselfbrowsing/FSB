import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { cronExecutionSchema, mapCronExecution } from './schemas.js';
import type { RawCronExecution } from './schemas.js';

export const listCronExecutions = defineTool({
  name: 'list_cron_executions',
  displayName: 'List Cron Executions',
  description:
    'List execution history for a scheduled (cron) job with pagination. Returns individual execution records with status and timing.',
  summary: 'List cron job executions',
  icon: 'history',
  group: 'Schedules',
  input: z.object({
    job_id: z.string().describe('Cron job ID'),
    page_num: z.number().int().optional().describe('Page number (1-based)'),
    page_size: z.number().int().optional().describe('Number of executions per page'),
  }),
  output: z.object({
    executions: z.array(cronExecutionSchema).describe('List of cron executions'),
    has_more: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const data = await apiPost<{
      executions?: RawCronExecution[];
      has_more?: boolean;
      base_resp: unknown;
    }>('/matrix/api/v1/cron/list_execution', {
      job_id: Number(params.job_id),
      ...(params.page_num != null && { page_num: params.page_num }),
      ...(params.page_size != null && { page_size: params.page_size }),
    });
    return {
      executions: (data.executions ?? []).map(mapCronExecution),
      has_more: data.has_more ?? false,
    };
  },
});
