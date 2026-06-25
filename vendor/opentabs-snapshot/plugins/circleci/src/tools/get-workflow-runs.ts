import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawWorkflowRun, mapWorkflowRun, workflowRunSchema } from './schemas.js';

export const getWorkflowRuns = defineTool({
  name: 'get_workflow_runs',
  displayName: 'Get Workflow Runs',
  description:
    'Get recent runs of a specific workflow including status, duration, and branch. Useful for monitoring workflow health.',
  summary: 'Get recent runs of a workflow',
  icon: 'activity',
  group: 'Insights',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    workflow_name: z.string().describe('Workflow name'),
    branch: z.string().optional().describe('Filter by branch name'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    runs: z.array(workflowRunSchema).describe('List of workflow runs'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ project_slug, workflow_name, branch, page_token }) => {
    const data = await api<Paginated<RawWorkflowRun>>(`/insights/${project_slug}/workflows/${workflow_name}`, {
      query: { branch, 'page-token': page_token },
    });
    return {
      runs: (data.items ?? []).map(mapWorkflowRun),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
