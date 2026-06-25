import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const searchProjects = defineTool({
  name: 'search_projects',
  displayName: 'Search Projects',
  description: 'Search for projects by name across GitLab.',
  summary: 'Search for projects',
  icon: 'search',
  group: 'Search',
  input: z.object({
    search: z.string().min(1).describe('Search query'),
    order_by: z
      .enum(['id', 'name', 'path', 'created_at', 'updated_at', 'last_activity_at'])
      .optional()
      .describe('Sort field (default: created_at)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('List of matching projects'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      search: params.search,
      per_page: params.per_page ?? 20,
      page: params.page,
      order_by: params.order_by,
      sort: params.sort,
    };

    const data = await api<Record<string, unknown>[]>('/projects', { query });
    return { projects: (data ?? []).map(mapProject) };
  },
});
