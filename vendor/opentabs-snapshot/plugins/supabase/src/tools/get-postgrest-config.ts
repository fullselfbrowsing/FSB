import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const getPostgrestConfig = defineTool({
  name: 'get_postgrest_config',
  displayName: 'Get PostgREST Config',
  description:
    'Get the PostgREST (auto-generated REST API) configuration for a project. ' +
    'Includes default schema, max rows, and JWT secret role claim key.',
  summary: 'Get PostgREST API configuration',
  icon: 'settings',
  group: 'Configuration',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    config: z.record(z.string(), z.unknown()).describe('PostgREST configuration'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/projects/${params.ref}/postgrest`);
    return { config: data };
  },
});
