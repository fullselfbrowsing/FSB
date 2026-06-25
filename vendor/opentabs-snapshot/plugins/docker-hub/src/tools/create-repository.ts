import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getUsername } from '../docker-hub-api.js';
import { mapRepositoryDetail, repositoryDetailSchema } from './schemas.js';
import type { RawRepositoryDetail } from './schemas.js';

export const createRepository = defineTool({
  name: 'create_repository',
  displayName: 'Create Repository',
  description:
    'Create a new Docker Hub repository in a namespace. The repository is created as a public image repository by default.',
  summary: 'Create a new Docker Hub repository',
  icon: 'plus',
  group: 'Repositories',
  input: z.object({
    namespace: z.string().optional().describe('Namespace (user or org). Defaults to the authenticated user.'),
    name: z.string().describe('Repository name (lowercase, alphanumeric, hyphens, underscores)'),
    description: z.string().optional().describe('Short description (max 100 chars)'),
    full_description: z.string().optional().describe('Full description in Markdown'),
    is_private: z.boolean().optional().describe('Whether the repository is private (default false)'),
  }),
  output: z.object({ repository: repositoryDetailSchema }),
  handle: async params => {
    const ns = params.namespace ?? getUsername();
    const body: Record<string, unknown> = {
      namespace: ns,
      name: params.name,
      is_private: params.is_private ?? false,
    };
    if (params.description !== undefined) body.description = params.description;
    if (params.full_description !== undefined) body.full_description = params.full_description;

    const data = await api<RawRepositoryDetail>(`/v2/repositories/${ns}/`, {
      method: 'POST',
      body,
    });
    return { repository: mapRepositoryDetail(data) };
  },
});
