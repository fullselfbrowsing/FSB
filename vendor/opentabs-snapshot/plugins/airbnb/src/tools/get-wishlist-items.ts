import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';

export const getWishlistItems = defineTool({
  name: 'get_wishlist_items',
  displayName: 'Get Wishlist Items',
  description: 'Get the wishlists that contain specific listings. Returns which wishlists each listing belongs to.',
  summary: 'Get wishlists containing specific listings',
  icon: 'list',
  group: 'Wishlists',
  input: z.object({
    listing_ids: z.array(z.string().min(1)).min(1).describe('Array of listing IDs to check'),
  }),
  output: z.object({
    items: z
      .array(
        z.object({
          listing_id: z.string().describe('The listing ID'),
          wishlists: z
            .array(
              z.object({
                id: z.string().describe('Wishlist ID'),
                name: z.string().describe('Wishlist name'),
              }),
            )
            .describe('Wishlists containing this listing'),
        }),
      )
      .describe('Wishlist membership info for each listing'),
  }),
  handle: async params => {
    const data = await graphql<{
      presentation: {
        wishlistItemsInfo: Array<{
          listingId?: string;
          wishlistItems?: Array<{ id?: string; name?: string }>;
        }>;
      };
    }>('WishlistItemsAsyncQuery', QUERY_HASHES.WishlistItemsAsyncQuery, {
      listingIds: params.listing_ids,
      listingType: 'HOME',
      networkCacheVersion: 1,
    });

    const info = data.presentation.wishlistItemsInfo ?? [];

    return {
      items: info.map(item => ({
        listing_id: item.listingId ?? '',
        wishlists: (item.wishlistItems ?? []).map(w => ({
          id: w.id ?? '',
          name: w.name ?? '',
        })),
      })),
    };
  },
});
