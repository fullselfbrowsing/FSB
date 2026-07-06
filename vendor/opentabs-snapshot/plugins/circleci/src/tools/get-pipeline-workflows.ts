import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawWorkflow, mapWorkflow, workflowSchema } from './schemas.js';

export const getPipelineWorkflows = defineTool({
  name: 'get_pipeline_workflows',
  displayName: 'Get Pipeline Workflows',
  description: 'List all workflows for a pipeline. Returns workflow names, statuses, and timing.',
  summary: 'List workflows for a pipeline',
  icon: 'workflow',
  group: 'Workflows',
  input: z.object({
    pipeline_id: z.string().describe('Pipeline UUID'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    workflows: z.array(workflowSchema).describe('List of workflows'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ pipeline_id, page_token }) => {
    const data = await api<Paginated<RawWorkflow>>(`/pipeline/${pipeline_id}/workflow`, {
      query: { 'page-token': page_token },
    });
    return {
      workflows: (data.items ?? []).map(mapWorkflow),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
