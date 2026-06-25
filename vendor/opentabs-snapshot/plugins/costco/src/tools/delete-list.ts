import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { deleteList } from '../costco-api.js';

export const deleteListTool = defineTool({
  name: 'delete_list',
  displayName: 'Delete List',
  description: 'Delete a shopping list from the Costco account. This action cannot be undone.',
  summary: 'Delete a shopping list',
  icon: 'trash-2',
  group: 'Lists',
  input: z.object({
    list_id: z.string().describe('Shopping list ID to delete (from get_lists)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await deleteList(params.list_id);
    return { success: true };
  },
});
