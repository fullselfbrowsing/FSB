import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const deleteList = defineTool({
  name: 'delete_list',
  displayName: 'Delete List',
  description: 'Delete a list. Only works for lists you own.',
  summary: 'Delete a list',
  icon: 'trash-2',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('DeleteList', { listId: params.list_id });
    return { success: true };
  },
});
