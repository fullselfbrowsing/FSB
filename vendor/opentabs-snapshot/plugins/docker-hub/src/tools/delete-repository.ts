import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';

export const deleteRepository = defineTool({
  name: 'delete_repository',
  displayName: 'Delete Repository',
  description:
    'Permanently delete a Docker Hub repository. This action cannot be undone. All tags and images in the repository will be deleted.',
  summary: 'Permanently delete a repository',
  icon: 'trash-2',
  group: 'Repositories',
  input: z.object({
    namespace: z.string().describe('Namespace (user or organization)'),
    repository: z.string().describe('Repository name'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/v2/repositories/${params.namespace}/${params.repository}/`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
