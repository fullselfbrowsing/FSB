import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { addToList } from '../costco-api.js';
import { listEntrySchema, mapListEntry } from './schemas.js';

export const addToListTool = defineTool({
  name: 'add_to_list',
  displayName: 'Add to List',
  description: 'Add a product to a Costco shopping list by item number.',
  summary: 'Add a product to a shopping list',
  icon: 'list-plus',
  group: 'Lists',
  input: z.object({
    list_id: z.string().describe('Shopping list ID (from get_lists)'),
    item_number: z.string().describe('Costco item number to add'),
    quantity: z.number().int().min(1).optional().describe('Quantity to add (default 1)'),
    comment: z.string().optional().describe('Optional comment for the item'),
  }),
  output: z.object({ entry: listEntrySchema }),
  handle: async params => {
    const data = await addToList(params.list_id, params.item_number, params.quantity ?? 1, params.comment ?? '');
    return { entry: mapListEntry(data) };
  },
});
