import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';

export const deleteExpert = defineTool({
  name: 'delete_expert',
  displayName: 'Delete Expert',
  description: 'Permanently delete an AI expert/agent by ID. This action cannot be undone.',
  summary: 'Delete an expert',
  icon: 'trash-2',
  group: 'Experts',
  input: z.object({
    id: z.number().describe('Expert ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  handle: async params => {
    await apiPost('/matrix/api/v1/expert/delete', { id: params.id });
    return { success: true };
  },
});
