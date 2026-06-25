import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orchestraApi } from '../starbucks-api.js';

export const deleteFavoriteProduct = defineTool({
  name: 'delete_favorite_product',
  displayName: 'Delete Favorite Product',
  description: "Remove a product from the user's favorites list. Use get_favorite_products to find the favorite ID.",
  summary: 'Remove a product from favorites',
  icon: 'heart-off',
  group: 'Orders',
  input: z.object({
    favorite_product_id: z.string().describe('Favorite product ID to remove (from get_favorite_products)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await orchestraApi('delete-favorite-product', {
      favoriteProductId: params.favorite_product_id,
    });
    return { success: true };
  },
});
