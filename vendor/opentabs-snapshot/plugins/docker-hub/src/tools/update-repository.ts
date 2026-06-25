import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapRepositoryDetail, repositoryDetailSchema } from './schemas.js';
import type { RawRepositoryDetail } from './schemas.js';

export const updateRepository = defineTool({
  name: 'update_repository',
  displayName: 'Update Repository',
  description: 'Update a Docker Hub repository. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update repository description or visibility',
  icon: 'pencil',
  group: 'Repositories',
  input: z.object({
    namespace: z.string().describe('Namespace (user or organization)'),
    repository: z.string().describe('Repository name'),
    description: z.string().optional().describe('New short description'),
    full_description: z.string().optional().describe('New full description in Markdown'),
    is_private: z.boolean().optional().describe('Change visibility'),
  }),
  output: z.object({ repository: repositoryDetailSchema }),
  handle: async params => {
    const body = stripUndefined({
      description: params.description,
      full_description: params.full_description,
      is_private: params.is_private,
    });
    const data = await api<RawRepositoryDetail>(`/v2/repositories/${params.namespace}/${params.repository}/`, {
      method: 'PATCH',
      body,
    });
    return { repository: mapRepositoryDetail(data) };
  },
});
