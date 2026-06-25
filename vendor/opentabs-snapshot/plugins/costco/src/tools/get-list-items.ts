import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchListEntries } from '../costco-api.js';
import { listEntrySchema, mapListEntry } from './schemas.js';

export const getListItems = defineTool({
  name: 'get_list_items',
  displayName: 'Get List Items',
  description: 'Get all items in a Costco shopping list. Each item includes the product item number and quantity.',
  summary: 'Get items in a shopping list',
  icon: 'list-ordered',
  group: 'Lists',
  input: z.object({
    list_id: z.string().describe('Shopping list ID (from get_lists)'),
  }),
  output: z.object({
    items: z.array(listEntrySchema),
  }),
  handle: async params => {
    const data = await fetchListEntries(params.list_id);
    return { items: data.map(mapListEntry) };
  },
});
