import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawApiKey, apiKeySchema, mapApiKey } from './schemas.js';

export const listApiKeys = defineTool({
  name: 'list_api_keys',
  displayName: 'List API Keys',
  description: 'List API keys on the account.',
  summary: 'List API Keys',
  icon: 'key',
  group: 'API Keys',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of keys to return per page (default 20, max 1000)'),
  }),
  output: z.object({
    keys: z.array(apiKeySchema).describe('Array of API keys'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };

    const data = await api<{ keys: RawApiKey[] }>('/Keys.json', { query });
    return { keys: (data.keys ?? []).map(mapApiKey) };
  },
});
