import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';

export const deleteApiKey = defineTool({
  name: 'delete_api_key',
  displayName: 'Delete API Key',
  description: 'Delete an API key by its SID. This action is permanent and cannot be undone.',
  summary: 'Delete API Key',
  icon: 'trash-2',
  group: 'API Keys',
  input: z.object({
    sid: z.string().describe('API Key SID to delete (e.g., SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the API key was successfully deleted'),
  }),
  handle: async params => {
    await api<Record<string, never>>(`/Keys/${params.sid}.json`, { method: 'DELETE' });
    return { success: true };
  },
});
