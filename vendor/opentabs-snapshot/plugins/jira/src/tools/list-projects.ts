import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { mapProject, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description: 'List Jira projects accessible to the current user with optional search.',
  summary: 'List accessible projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    query: z.string().optional().describe('Search query to filter projects by name'),
    max_results: z.number().optional().describe('Maximum number of projects to return (default 20, max 50)'),
    start_at: z.number().optional().describe('Index of the first project to return for pagination'),
  }),
  output: z.object({
    projects: z.array(projectSchema).describe('Matching projects'),
    total: z.number().describe('Total number of matching projects'),
  }),
  handle: async params => {
    const data = await api<{
      values?: Record<string, unknown>[];
      total?: number;
    }>('/project/search', {
      query: {
        query: params.query,
        maxResults: params.max_results ?? 20,
        startAt: params.start_at ?? 0,
      },
    });
    return {
      projects: (data.values ?? []).map(mapProject),
      total: data.total ?? 0,
    };
  },
});
