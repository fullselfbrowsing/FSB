import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orchestraApi } from '../starbucks-api.js';

const favoriteProductSchema = z.object({
  id: z.string().describe('Favorite product ID (used to delete the favorite)'),
  product_number: z.number().describe('Product number'),
  name: z.string().describe('Product display name'),
  form: z.string().describe('Product form (e.g., "iced", "hot")'),
  size: z.string().describe('Size name (e.g., "Grande")'),
});

interface RawFavoriteProduct {
  id?: string;
  productNumber?: number;
  name?: string;
  formCode?: string;
  sizeCode?: string;
}

const mapFavoriteProduct = (f: RawFavoriteProduct) => ({
  id: f.id ?? '',
  product_number: f.productNumber ?? 0,
  name: f.name ?? '',
  form: f.formCode ?? '',
  size: f.sizeCode ?? '',
});

export const getFavoriteProducts = defineTool({
  name: 'get_favorite_products',
  displayName: 'Get Favorite Products',
  description: "Get the user's favorite (saved) menu products. Requires a store number for availability context.",
  summary: 'List favorite menu products',
  icon: 'heart',
  group: 'Orders',
  input: z.object({
    store_number: z.string().describe('Store number for availability context (e.g., "53646-283069")'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of favorites to return (default 10)'),
  }),
  output: z.object({
    favorites: z.array(favoriteProductSchema).describe('Favorite products'),
  }),
  handle: async params => {
    interface OrchestraResponse {
      data?: { favoriteProducts?: RawFavoriteProduct[] };
    }
    const data = await orchestraApi<OrchestraResponse>('get-favorite-products', {
      storeNumber: params.store_number,
      locale: 'en-US',
      limit: params.limit ?? 10,
    });
    return {
      favorites: (data.data?.favoriteProducts ?? []).map(mapFavoriteProduct),
    };
  },
});
