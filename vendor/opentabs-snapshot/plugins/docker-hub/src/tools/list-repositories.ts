import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getUsername } from '../docker-hub-api.js';
import { mapRepository, repositorySchema } from './schemas.js';
import type { PaginatedResponse, RawRepository } from './schemas.js';

export const listRepositories = defineTool({
  name: 'list_repositories',
  displayName: 'List Repositories',
  description:
    'List Docker Hub repositories in a namespace (user or organization). Defaults to the current user. Supports filtering by name and sorting.',
  summary: 'List repositories in a namespace',
  icon: 'list',
  group: 'Repositories',
  input: z.object({
    namespace: z.string().optional().describe('Namespace (user or org). Defaults to the authenticated user.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100)'),
    ordering: z
      .enum(['name', '-name', 'last_updated', '-last_updated'])
      .optional()
      .describe('Sort order (default: last_updated descending)'),
  }),
  output: z.object({
    count: z.number().describe('Total number of repositories'),
    repositories: z.array(repositorySchema),
  }),
  handle: async params => {
    const ns = params.namespace ?? getUsername();
    const data = await api<PaginatedResponse<RawRepository>>(`/v2/namespaces/${ns}/repositories`, {
      query: {
        page: params.page,
        page_size: params.page_size ?? 25,
        ordering: params.ordering,
      },
    });
    return {
      count: data.count ?? 0,
      repositories: (data.results ?? []).map(mapRepository),
    };
  },
});
