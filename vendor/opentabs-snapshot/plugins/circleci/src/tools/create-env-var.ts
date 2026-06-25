import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawEnvVar, envVarSchema, mapEnvVar } from './schemas.js';

export const createEnvVar = defineTool({
  name: 'create_env_var',
  displayName: 'Create Env Var',
  description: 'Create a project environment variable. The value is stored securely and masked in responses.',
  summary: 'Create a project env var',
  icon: 'plus',
  group: 'Environment',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
    name: z.string().describe('Variable name'),
    value: z.string().describe('Variable value'),
  }),
  output: z.object({ env_var: envVarSchema }),
  handle: async ({ project_slug, name, value }) => {
    const data = await api<RawEnvVar>(`/project/${project_slug}/envvar`, {
      method: 'POST',
      body: { name, value },
    });
    return { env_var: mapEnvVar(data) };
  },
});
