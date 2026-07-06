import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type Paginated, type RawContextEnvVar, contextEnvVarSchema, mapContextEnvVar } from './schemas.js';

export const listContextEnvVars = defineTool({
  name: 'list_context_env_vars',
  displayName: 'List Context Env Vars',
  description: 'List environment variables in a context. Values are not returned for security.',
  summary: 'List context env vars',
  icon: 'key',
  group: 'Contexts',
  input: z.object({
    context_id: z.string().describe('Context UUID'),
    page_token: z.string().optional().describe('Pagination token from a previous response'),
  }),
  output: z.object({
    env_vars: z.array(contextEnvVarSchema).describe('List of environment variables'),
    next_page_token: z.string().describe('Token for the next page, empty if no more results'),
  }),
  handle: async ({ context_id, page_token }) => {
    const data = await api<Paginated<RawContextEnvVar>>(`/context/${context_id}/environment-variable`, {
      query: { 'page-token': page_token },
    });
    return {
      env_vars: (data.items ?? []).map(mapContextEnvVar),
      next_page_token: data.next_page_token ?? '',
    };
  },
});
