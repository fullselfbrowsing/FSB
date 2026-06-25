import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { categorySchema, mapCategory } from './schemas.js';

export const getMenuCategories = defineTool({
  name: 'get_menu_categories',
  displayName: 'Get Menu Categories',
  description:
    "List all menu categories (e.g., Specialty Pizzas, Wings, Desserts, Drinks). Use the category ID with get_category_products to browse items. Optionally scope to a specific store's menu.",
  summary: 'List menu categories',
  icon: 'layout-grid',
  group: 'Menu',
  input: z.object({
    store_id: z.string().optional().describe('Store ID to get store-specific menu categories'),
  }),
  output: z.object({
    categories: z.array(categorySchema).describe('Menu categories'),
  }),
  handle: async params => {
    const data = await gql<{
      categoriesV2: Array<Record<string, unknown>>;
    }>(
      'CategoryV2',
      `query CategoryV2($storeId: String) {
  categoriesV2(storeId: $storeId) {
    id image isNew name
  }
}`,
      { storeId: params.store_id },
    );
    return {
      categories: (data.categoriesV2 ?? []).map(mapCategory),
    };
  },
});
