import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawJob, jobSchema, mapJob } from './schemas.js';

export const getWorkflowJobs = defineTool({
  name: 'get_workflow_jobs',
  displayName: 'Get Workflow Jobs',
  description: 'List all jobs in a workflow. Returns job names, statuses, types, and timing.',
  summary: 'List jobs in a workflow',
  icon: 'layers',
  group: 'Workflows',
  input: z.object({
    workflow_id: z.string().describe('Workflow UUID'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    jobs: z.array(jobSchema).describe('List of jobs'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ workflow_id, page_token }) => {
    const data = await api<Paginated<RawJob>>(`/workflow/${workflow_id}/job`, { query: { 'page-token': page_token } });
    return {
      jobs: (data.items ?? []).map(mapJob),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
