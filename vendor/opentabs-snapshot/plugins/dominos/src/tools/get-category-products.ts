import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { productSchema, mapProduct } from './schemas.js';

export const getCategoryProducts = defineTool({
  name: 'get_category_products',
  displayName: 'Get Category Products',
  description:
    'List all products (menu items) within a menu category. Use the category_id from get_menu_categories. Common categories: BuildYourOwn, Specialty, Bread, Tots, Wings, Dessert, Pasta, Sandwich, GSalad, Drinks, Sides.',
  summary: 'List products in a menu category',
  icon: 'pizza',
  group: 'Menu',
  input: z.object({
    category_id: z.string().describe('Category ID (e.g., "Specialty", "Wings", "Dessert", "Drinks")'),
    store_id: z.string().optional().describe('Store ID for store-specific pricing and availability'),
  }),
  output: z.object({
    category_name: z.string().describe('Category display name'),
    products: z.array(productSchema).describe('Products in the category'),
  }),
  handle: async params => {
    const data = await gql<{
      category: {
        name: string;
        products: Array<Record<string, unknown>>;
      };
    }>(
      'Products',
      `query Products($categoryId: String!, $storeId: String) {
  category(categoryId: $categoryId, storeId: $storeId) {
    name
    products {
      description productType code price size id image isPopular name
      maxQuantity isBuildYourOwn
    }
  }
}`,
      { categoryId: params.category_id, storeId: params.store_id },
    );
    return {
      category_name: data.category?.name ?? '',
      products: (data.category?.products ?? []).map(mapProduct),
    };
  },
});
