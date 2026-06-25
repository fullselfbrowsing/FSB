import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

const apiKeySchema = z.object({
  name: z.string().describe('API key name (e.g., "anon", "service_role")'),
  api_key: z.string().describe('The API key value'),
});

const mapApiKey = (k: Record<string, unknown> | undefined) => ({
  name: (k?.name as string) ?? '',
  api_key: (k?.api_key as string) ?? '',
});

export const getApiKeys = defineTool({
  name: 'get_api_keys',
  displayName: 'Get API Keys',
  description:
    'Get the API keys for a Supabase project. ' +
    'Returns the anon key, service_role key, and any publishable/secret keys.',
  summary: 'Get project API keys',
  icon: 'key',
  group: 'Secrets',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    api_keys: z.array(apiKeySchema).describe('List of API keys'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/api-keys`);
    return { api_keys: data.map(mapApiKey) };
  },
});
