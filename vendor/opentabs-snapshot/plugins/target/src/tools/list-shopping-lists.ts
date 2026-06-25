import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../target-api.js';
import { shoppingListSchema, mapShoppingList } from './schemas.js';
import type { RawShoppingList } from './schemas.js';

export const listShoppingLists = defineTool({
  name: 'list_shopping_lists',
  displayName: 'List Shopping Lists',
  description:
    "List all of the user's Target shopping lists including the default shopping list and any custom lists. Returns list name, type, item count, and last modified date.",
  summary: 'List all shopping lists',
  icon: 'list',
  group: 'Lists',
  input: z.object({}),
  output: z.object({
    lists: z.array(shoppingListSchema),
  }),
  handle: async () => {
    const data = await api<RawShoppingList[]>('lists/v4');
    return {
      lists: (data ?? []).map(mapShoppingList),
    };
  },
});
