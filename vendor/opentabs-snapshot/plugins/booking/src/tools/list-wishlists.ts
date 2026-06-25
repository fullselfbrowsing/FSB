import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache } from '../booking-api.js';
import { wishlistSchema } from './schemas.js';

export const listWishlists = defineTool({
  name: 'list_wishlists',
  displayName: 'List Wishlists',
  description:
    "List the current user's saved wishlists on Booking.com. Returns wishlist names, item counts, and cover images.",
  summary: 'List saved wishlists',
  icon: 'heart',
  group: 'Wishlists',
  input: z.object({}),
  output: z.object({
    wishlists: z.array(wishlistSchema).describe('List of user wishlists'),
  }),
  handle: async () => {
    const doc = await fetchPage('/mywishlist.html');
    const cache = extractApolloCache(doc);

    if (!cache?.ROOT_QUERY) return { wishlists: [] };

    const wishlists: Array<{
      list_id: string;
      name: string;
      item_count: number;
      image_url: string;
    }> = [];

    // Scan the Apollo cache for wishlist data
    for (const [key, value] of Object.entries(cache.ROOT_QUERY)) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;

      if (key.includes('wishlist') || key.includes('Wishlist') || v.__typename === 'WishlistServiceQueries') {
        const userWishlist = (v.userWishlist ?? v) as Record<string, unknown>;
        const lists = (userWishlist.wishlists ?? []) as Array<Record<string, unknown>>;

        for (const list of lists) {
          wishlists.push({
            list_id: String(list.listId ?? list.id ?? ''),
            name: String(list.name ?? list.title ?? 'My Wishlist'),
            item_count:
              Number(list.nbHotels ?? 0) +
              Number(list.nbAttractions ?? 0) +
              Number(list.nbFlights ?? 0) +
              Number(list.itemCount ?? 0),
            image_url: String(list.headerImageUrl ?? list.imageUrl ?? ''),
          });
        }
      }
    }

    // Scan cache entities for wishlist items
    if (wishlists.length === 0) {
      for (const [key, value] of Object.entries(cache)) {
        if (key === 'ROOT_QUERY') continue;
        if (typeof value !== 'object' || value === null) continue;
        const v = value as Record<string, unknown>;

        if (v.__typename === 'Wishlist' || v.__typename === 'WishlistItem') {
          wishlists.push({
            list_id: String(v.listId ?? v.id ?? key),
            name: String(v.name ?? v.title ?? 'Wishlist'),
            item_count: Number(v.itemCount ?? v.nbHotels ?? 0),
            image_url: String(v.headerImageUrl ?? v.imageUrl ?? ''),
          });
        }
      }
    }

    return { wishlists };
  },
});
