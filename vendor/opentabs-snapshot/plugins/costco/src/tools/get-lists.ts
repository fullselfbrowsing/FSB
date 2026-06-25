import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchLists } from '../costco-api.js';
import { listSchema, mapList } from './schemas.js';

export const getLists = defineTool({
  name: 'get_lists',
  displayName: 'Get Lists',
  description:
    'Get all shopping lists (wishlists) for the current Costco member. Each list can contain saved products.',
  summary: 'Get shopping lists',
  icon: 'list',
  group: 'Lists',
  input: z.object({}),
  output: z.object({
    lists: z.array(listSchema),
  }),
  handle: async () => {
    const data = await fetchLists();
    return { lists: data.map(mapList) };
  },
});
