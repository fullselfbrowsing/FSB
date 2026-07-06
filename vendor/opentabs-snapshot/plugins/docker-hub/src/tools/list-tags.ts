import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapTag, tagSchema } from './schemas.js';
import type { PaginatedResponse, RawTag } from './schemas.js';

export const listTags = defineTool({
  name: 'list_tags',
  displayName: 'List Tags',
  description:
    'List tags for a Docker Hub repository. Returns tag names, digests, sizes, platform support, and last update times. Use namespace "library" for official images (e.g., library/nginx).',
  summary: 'List repository tags',
  icon: 'tag',
  group: 'Tags',
  input: z.object({
    namespace: z.string().describe('Namespace (e.g., "library" for official images, or username/org)'),
    repository: z.string().describe('Repository name (e.g., "nginx")'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100)'),
  }),
  output: z.object({
    count: z.number().describe('Total number of tags'),
    tags: z.array(tagSchema),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawTag>>(
      `/v2/namespaces/${params.namespace}/repositories/${params.repository}/tags`,
      {
        query: {
          page: params.page,
          page_size: params.page_size ?? 25,
        },
      },
    );
    return {
      count: data.count ?? 0,
      tags: (data.results ?? []).map(mapTag),
    };
  },
});
