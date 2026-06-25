import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { branchSchema, mapBranch } from './schemas.js';

export const listBranches = defineTool({
  name: 'list_branches',
  displayName: 'List Branches',
  description: 'List branches for a project. Can filter by search query.',
  summary: 'List branches for a project',
  icon: 'git-branch',
  group: 'Branches',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    search: z.string().optional().describe('Search by branch name'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    branches: z.array(branchSchema).describe('List of branches'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      per_page: params.per_page ?? 20,
      page: params.page,
    };
    if (params.search) query.search = params.search;

    const data = await api<Record<string, unknown>[]>(
      `/projects/${encodeURIComponent(params.project)}/repository/branches`,
      { query },
    );
    return { branches: (data ?? []).map(mapBranch) };
  },
});
