import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List projects accessible to the authenticated user. Can filter by membership, visibility, search query, and more.',
  summary: 'List accessible projects',
  icon: 'folder-git-2',
  group: 'Projects',
  input: z.object({
    membership: z.boolean().optional().describe('Limit to projects the user is a member of (default: false)'),
    owned: z.boolean().optional().describe('Limit to projects owned by the user (default: false)'),
    search: z.string().optional().describe('Search by project name'),
    visibility: z.enum(['public', 'internal', 'private']).optional().describe('Filter by visibility level'),
    order_by: z
      .enum(['id', 'name', 'path', 'created_at', 'updated_at', 'last_activity_at'])
      .optional()
      .describe('Sort field (default: created_at)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of projects'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      per_page: params.per_page ?? 20,
      page: params.page,
      order_by: params.order_by,
      sort: params.sort,
    };
    if (params.membership !== undefined) query.membership = params.membership;
    if (params.owned !== undefined) query.owned = params.owned;
    if (params.search) query.search = params.search;
    if (params.visibility) query.visibility = params.visibility;

    const data = await api<Record<string, unknown>[]>('/projects', { query });
    return { projects: (data ?? []).map(mapProject) };
  },
});
