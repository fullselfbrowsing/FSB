import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../starbucks-api.js';
import { mapMenuCategory, menuCategorySchema } from './schemas.js';

export const getStoreMenu = defineTool({
  name: 'get_store_menu',
  displayName: 'Get Store Menu',
  description:
    'Get the menu categories and subcategories for a specific Starbucks store. Returns the top-level categories (e.g., Drinks, Food) with their subcategories and product counts. Use find_stores to get a store number first.',
  summary: 'Get menu categories for a store',
  icon: 'utensils',
  group: 'Menu',
  input: z.object({
    store_number: z
      .string()
      .describe('Store number (e.g., "53646-283069"). Use find_stores to discover store numbers.'),
  }),
  output: z.object({
    categories: z.array(menuCategorySchema).describe('Top-level menu categories'),
  }),
  handle: async params => {
    interface MenuResponse {
      menus?: Array<Record<string, unknown>>;
    }
    const data = await api<MenuResponse>('/ordering/menu', {
      query: { storeNumber: params.store_number },
    });
    return {
      categories: (data.menus ?? []).map(c => mapMenuCategory(c as Parameters<typeof mapMenuCategory>[0])),
    };
  },
});
