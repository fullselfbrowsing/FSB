import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawEnvVar, envVarSchema, mapEnvVar } from './schemas.js';

export const listEnvVars = defineTool({
  name: 'list_env_vars',
  displayName: 'List Env Vars',
  description: 'List environment variables for a project. Values are masked.',
  summary: 'List project env vars',
  icon: 'key',
  group: 'Environment',
  input: z.object({
    project_slug: z.string().describe('Project slug e.g. "gh/org/repo"'),
  }),
  output: z.object({
    env_vars: z.array(envVarSchema).describe('List of environment variables'),
    next_page_token: z.string().describe('Token for the next page, empty if no more results'),
  }),
  handle: async ({ project_slug }) => {
    const data = await api<Paginated<RawEnvVar>>(`/project/${project_slug}/envvar`);
    return {
      env_vars: (data.items ?? []).map(mapEnvVar),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
