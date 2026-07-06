import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { issueSchema, mapIssue } from './schemas.js';

export const listIssues = defineTool({
  name: 'list_issues',
  displayName: 'List Issues',
  description:
    'List issues for a project. By default returns opened issues sorted by creation date. Can filter by state, labels, assignee, milestone, and more.',
  summary: 'List issues for a project',
  icon: 'circle-dot',
  group: 'Issues',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    state: z.enum(['opened', 'closed', 'all']).optional().describe('Issue state filter (default: opened)'),
    labels: z.string().optional().describe('Comma-separated list of label names to filter by'),
    assignee_username: z.string().optional().describe('Filter by assignee username'),
    milestone: z.string().optional().describe('Milestone title to filter by, or "None" / "Any"'),
    search: z.string().optional().describe('Search in title and description'),
    order_by: z.enum(['created_at', 'updated_at']).optional().describe('Sort field (default: created_at)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    issues: z.array(issueSchema).describe('List of issues'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      state: params.state ?? 'opened',
      per_page: params.per_page ?? 20,
      page: params.page,
      order_by: params.order_by,
      sort: params.sort,
    };
    if (params.labels) query.labels = params.labels;
    if (params.assignee_username) query.assignee_username = params.assignee_username;
    if (params.milestone) query.milestone = params.milestone;
    if (params.search) query.search = params.search;

    const data = await api<Record<string, unknown>[]>(`/projects/${encodeURIComponent(params.project)}/issues`, {
      query,
    });
    return { issues: (data ?? []).map(mapIssue) };
  },
});
