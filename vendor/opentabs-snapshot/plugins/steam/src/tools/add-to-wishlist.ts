import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storePost } from '../steam-api.js';

interface WishlistResponse {
  success: boolean;
  wishlistCount?: number;
}

export const addToWishlist = defineTool({
  name: 'add_to_wishlist',
  displayName: 'Add to Wishlist',
  description:
    "Add a game to the current user's Steam wishlist by app ID. Returns the updated wishlist count. Fails if the app is already wishlisted or does not exist.",
  summary: 'Add a game to your Steam wishlist',
  icon: 'heart',
  group: 'Wishlist',
  input: z.object({
    appid: z.number().int().describe('Steam app ID to add to wishlist'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
    wishlist_count: z.number().describe('Updated total wishlist count'),
  }),
  handle: async params => {
    const data = await storePost<WishlistResponse>('/api/addtowishlist', {
      appid: params.appid,
    });
    if (!data.success) {
      throw ToolError.validation(
        `Failed to add app ${params.appid} to wishlist — it may already be wishlisted or does not exist.`,
      );
    }
    return { success: true, wishlist_count: data.wishlistCount ?? 0 };
  },
});
