import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';

export const deleteVariable = defineTool({
  name: 'delete_variable',
  displayName: 'Delete Variable',
  description: 'Delete a workspace variable.',
  summary: 'Delete a workspace variable',
  icon: 'trash-2',
  group: 'Variables',
  input: z.object({
    variable_id: z.string().describe('Variable ID (e.g., "var-...")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api<Record<string, never>>(`/vars/${encodeURIComponent(params.variable_id)}`, { method: 'DELETE' });

    return {
      success: true,
    };
  },
});
