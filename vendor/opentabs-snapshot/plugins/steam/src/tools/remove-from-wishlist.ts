import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storePost } from '../steam-api.js';

interface WishlistResponse {
  success: boolean;
  wishlistCount?: number;
}

export const removeFromWishlist = defineTool({
  name: 'remove_from_wishlist',
  displayName: 'Remove from Wishlist',
  description: "Remove a game from the current user's Steam wishlist by app ID. Returns the updated wishlist count.",
  summary: 'Remove a game from your Steam wishlist',
  icon: 'heart-off',
  group: 'Wishlist',
  input: z.object({
    appid: z.number().int().describe('Steam app ID to remove from wishlist'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
    wishlist_count: z.number().describe('Updated total wishlist count'),
  }),
  handle: async params => {
    const data = await storePost<WishlistResponse>('/api/removefromwishlist', {
      appid: params.appid,
    });
    if (!data.success) {
      throw ToolError.validation(`Failed to remove app ${params.appid} from wishlist — it may not be on the wishlist.`);
    }
    return { success: true, wishlist_count: data.wishlistCount ?? 0 };
  },
});
