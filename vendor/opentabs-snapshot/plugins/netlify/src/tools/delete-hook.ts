import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const deleteHook = defineTool({
  name: 'delete_hook',
  displayName: 'Delete Hook',
  description: 'Delete a notification hook (outgoing webhook) by its ID. This action cannot be undone.',
  summary: 'Delete a notification hook',
  icon: 'trash-2',
  group: 'Hooks',
  input: z.object({
    hook_id: z.string().describe('The hook ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/hooks/${params.hook_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
