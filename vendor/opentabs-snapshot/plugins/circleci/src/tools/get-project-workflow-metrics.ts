import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawWorkflowMetric, mapWorkflowMetric, workflowMetricSchema } from './schemas.js';

export const getProjectWorkflowMetrics = defineTool({
  name: 'get_project_workflow_metrics',
  displayName: 'Get Workflow Metrics',
  description:
    'Get summary metrics for all workflows in a project including success rates, durations, and throughput. Covers the last 90 days by default.',
  summary: 'Get workflow metrics for a project',
  icon: 'bar-chart-3',
  group: 'Insights',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
    branch: z.string().optional().describe('Filter by branch name'),
    reporting_window: z
      .enum(['last-7-days', 'last-30-days', 'last-60-days', 'last-90-days'])
      .optional()
      .describe('Time window (default "last-90-days")'),
  }),
  output: z.object({
    metrics: z.array(workflowMetricSchema).describe('List of workflow metrics'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ project_slug, page_token, branch, reporting_window }) => {
    const data = await api<Paginated<RawWorkflowMetric>>(`/insights/${project_slug}/workflows`, {
      query: { branch, 'reporting-window': reporting_window, 'page-token': page_token },
    });
    return {
      metrics: (data.items ?? []).map(mapWorkflowMetric),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
