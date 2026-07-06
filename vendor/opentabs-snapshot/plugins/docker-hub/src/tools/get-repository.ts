import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapRepositoryDetail, repositoryDetailSchema } from './schemas.js';
import type { RawRepositoryDetail } from './schemas.js';

export const getRepository = defineTool({
  name: 'get_repository',
  displayName: 'Get Repository',
  description:
    'Get detailed information about a Docker Hub repository including description, pull count, star count, permissions, categories, and full README.',
  summary: 'Get detailed repository information',
  icon: 'box',
  group: 'Repositories',
  input: z.object({
    namespace: z.string().describe('Namespace (user or organization, e.g., "library" for official images)'),
    repository: z.string().describe('Repository name (e.g., "nginx")'),
  }),
  output: z.object({ repository: repositoryDetailSchema }),
  handle: async params => {
    const data = await api<RawRepositoryDetail>(`/v2/namespaces/${params.namespace}/repositories/${params.repository}`);
    return { repository: mapRepositoryDetail(data) };
  },
});
