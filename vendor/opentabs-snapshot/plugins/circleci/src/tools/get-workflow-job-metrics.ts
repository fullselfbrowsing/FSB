import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawJobMetric, jobMetricSchema, mapJobMetric } from './schemas.js';

export const getWorkflowJobMetrics = defineTool({
  name: 'get_workflow_job_metrics',
  displayName: 'Get Job Metrics',
  description: 'Get job-level metrics for a specific workflow including success rates and durations per job.',
  summary: 'Get job metrics for a workflow',
  icon: 'bar-chart-3',
  group: 'Insights',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    workflow_name: z.string().describe('Workflow name'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
    reporting_window: z
      .enum(['last-7-days', 'last-30-days', 'last-60-days', 'last-90-days'])
      .optional()
      .describe('Time window (default "last-90-days")'),
  }),
  output: z.object({
    metrics: z.array(jobMetricSchema).describe('List of job metrics'),
    next_page_token: z.string().describe('Token for the next page, empty if no more pages'),
  }),
  handle: async ({ project_slug, workflow_name, page_token, reporting_window }) => {
    const data = await api<Paginated<RawJobMetric>>(`/insights/${project_slug}/workflows/${workflow_name}/jobs`, {
      query: { 'reporting-window': reporting_window, 'page-token': page_token },
    });
    return {
      metrics: (data.items ?? []).map(mapJobMetric),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
