import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const deleteContext = defineTool({
  name: 'delete_context',
  displayName: 'Delete Context',
  description: 'Delete a context and all its environment variables. This action cannot be undone.',
  summary: 'Delete a context',
  icon: 'trash-2',
  group: 'Contexts',
  input: z.object({
    context_id: z.string().describe('Context UUID'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the deletion succeeded') }),
  handle: async ({ context_id }) => {
    await api<{ message: string }>(`/context/${context_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
