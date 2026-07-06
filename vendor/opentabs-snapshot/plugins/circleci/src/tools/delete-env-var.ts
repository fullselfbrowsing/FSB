import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const deleteEnvVar = defineTool({
  name: 'delete_env_var',
  displayName: 'Delete Env Var',
  description: 'Delete a project environment variable. This action cannot be undone.',
  summary: 'Delete a project env var',
  icon: 'trash-2',
  group: 'Environment',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    name: z.string().describe('Variable name to delete'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the deletion succeeded') }),
  handle: async ({ project_slug, name }) => {
    await api<{ message: string }>(`/project/${project_slug}/envvar/${name}`, { method: 'DELETE' });
    return { success: true };
  },
});
