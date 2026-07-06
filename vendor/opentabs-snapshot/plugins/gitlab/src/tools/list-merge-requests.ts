import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapMergeRequest, mergeRequestSchema } from './schemas.js';

export const listMergeRequests = defineTool({
  name: 'list_merge_requests',
  displayName: 'List Merge Requests',
  description:
    'List merge requests for a project. By default returns opened MRs sorted by creation date. Can filter by state, labels, author, assignee, and more.',
  summary: 'List merge requests for a project',
  icon: 'git-pull-request',
  group: 'Merge Requests',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    state: z
      .enum(['opened', 'closed', 'merged', 'locked', 'all'])
      .optional()
      .describe('MR state filter (default: opened)'),
    labels: z.string().optional().describe('Comma-separated list of label names to filter by'),
    author_username: z.string().optional().describe('Filter by author username'),
    assignee_id: z.number().optional().describe('Filter by assignee user ID'),
    source_branch: z.string().optional().describe('Filter by source branch'),
    target_branch: z.string().optional().describe('Filter by target branch'),
    search: z.string().optional().describe('Search in title and description'),
    order_by: z.enum(['created_at', 'updated_at']).optional().describe('Sort field (default: created_at)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    merge_requests: z.array(mergeRequestSchema).describe('List of merge requests'),
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
    if (params.author_username) query.author_username = params.author_username;
    if (params.assignee_id !== undefined) query.assignee_id = params.assignee_id;
    if (params.source_branch) query.source_branch = params.source_branch;
    if (params.target_branch) query.target_branch = params.target_branch;
    if (params.search) query.search = params.search;

    const data = await api<Record<string, unknown>[]>(
      `/projects/${encodeURIComponent(params.project)}/merge_requests`,
      { query },
    );
    return { merge_requests: (data ?? []).map(mapMergeRequest) };
  },
});
