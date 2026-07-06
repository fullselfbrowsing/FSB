import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawNewApiKey, mapNewApiKey, newApiKeySchema } from './schemas.js';

export const createApiKey = defineTool({
  name: 'create_api_key',
  displayName: 'Create API Key',
  description: 'Create a new API key. The secret is only returned once at creation time — store it securely.',
  summary: 'Create API Key',
  icon: 'plus',
  group: 'API Keys',
  input: z.object({
    friendly_name: z.string().describe('Friendly name for the API key'),
  }),
  output: newApiKeySchema,
  handle: async params => {
    const body: Record<string, string> = {
      FriendlyName: params.friendly_name,
    };

    const data = await api<RawNewApiKey>('/Keys.json', { method: 'POST', body });
    return mapNewApiKey(data);
  },
});
