import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { deleteListEntry } from '../costco-api.js';

export const removeListItem = defineTool({
  name: 'remove_list_item',
  displayName: 'Remove List Item',
  description: 'Remove an item from a Costco shopping list.',
  summary: 'Remove an item from a shopping list',
  icon: 'list-minus',
  group: 'Lists',
  input: z.object({
    list_id: z.string().describe('Shopping list ID (from get_lists)'),
    entry_id: z.string().describe('List entry ID to remove (from get_list_items)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the removal succeeded'),
  }),
  handle: async params => {
    await deleteListEntry(params.list_id, params.entry_id);
    return { success: true };
  },
});
