import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';

export const deleteVariableSet = defineTool({
  name: 'delete_variable_set',
  displayName: 'Delete Variable Set',
  description: 'Delete a variable set.',
  summary: 'Delete a variable set',
  icon: 'trash-2',
  group: 'Variable Sets',
  input: z.object({
    varset_id: z.string().describe('Variable set ID (e.g., "varset-...")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/varsets/${encodeURIComponent(params.varset_id)}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
