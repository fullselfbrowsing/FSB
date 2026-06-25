import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orchestraApi } from '../starbucks-api.js';

export const addFavoriteProduct = defineTool({
  name: 'add_favorite_product',
  displayName: 'Add Favorite Product',
  description:
    "Save a menu product to the user's favorites list. Requires the product details including SKU, size, and customizations.",
  summary: 'Save a product to favorites',
  icon: 'heart',
  group: 'Orders',
  input: z.object({
    name: z.string().describe('Product display name'),
    product_number: z.number().int().describe('Product number (from get_product)'),
    form: z.string().describe('Product form code (e.g., "Iced", "Hot")'),
    size_code: z.string().describe('Size code (e.g., "Tall", "Grande", "Venti")'),
    sku: z.string().describe('SKU for the specific size (from get_product size data)'),
  }),
  output: z.object({
    favorite_id: z.string().describe('ID of the created favorite (use to delete later)'),
  }),
  handle: async params => {
    interface OrchestraResponse {
      data?: {
        createFavoriteProduct?: { id?: string };
      };
    }
    const data = await orchestraApi<OrchestraResponse>('add-favorite-product', {
      favoriteProduct: {
        name: params.name,
        productNumber: params.product_number,
        formCode: params.form,
        sizeCode: params.size_code,
        commerce: { sku: params.sku },
        childItems: [],
      },
    });
    return {
      favorite_id: data.data?.createFavoriteProduct?.id ?? '',
    };
  },
});
