import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphqlMutation, QUERY_HASHES } from '../airbnb-api.js';

interface BatchDeleteResponse {
  batchDeleteWishlistItemsByWishlistItemId: {
    statusCode?: string;
    statusMessage?: string;
    deletedWishlistItemIds?: string[];
    failedToDeleteWishlistItemIds?: string[];
    deletedWishlistItems?: Array<{
      wishlistItemId?: string;
      wishlistId?: string;
      wishlistName?: string;
    }>;
  };
}

export const removeFromWishlist = defineTool({
  name: 'remove_from_wishlist',
  displayName: 'Remove from Wishlist',
  description:
    'Remove one or more listings from wishlists by wishlist item IDs. Get wishlist item IDs from the save_to_wishlist response or by listing wishlists.',
  summary: 'Remove listings from wishlists',
  icon: 'heart-off',
  group: 'Wishlists',
  input: z.object({
    wishlist_item_ids: z
      .array(z.string().min(1))
      .min(1)
      .describe('Array of wishlist item IDs to remove (e.g., ["11005458471314"])'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether all items were removed successfully'),
    deleted_count: z.number().int().describe('Number of items successfully deleted'),
    deleted_items: z
      .array(
        z.object({
          wishlist_item_id: z.string().describe('Deleted wishlist item ID'),
          wishlist_name: z.string().describe('Name of the wishlist the item was in'),
        }),
      )
      .describe('Details of deleted items'),
    message: z.string().describe('Status message from the API'),
  }),
  handle: async params => {
    const data = await graphqlMutation<BatchDeleteResponse>(
      'BatchDeleteWishlistItemsByWishlistItemIdMutation',
      QUERY_HASHES.BatchDeleteWishlistItemsByWishlistItemIdMutation,
      {
        wishlistItemIds: params.wishlist_item_ids,
        checkWishlistItemNotesBeforeUnsave: false,
        checkWishlistItemVotesBeforeUnsave: false,
      },
    );

    const result = data.batchDeleteWishlistItemsByWishlistItemId;
    const deletedItems = (result.deletedWishlistItems ?? []).map(item => ({
      wishlist_item_id: item.wishlistItemId ?? '',
      wishlist_name: item.wishlistName ?? '',
    }));

    return {
      success: result.statusCode === 'OK',
      deleted_count: result.deletedWishlistItemIds?.length ?? 0,
      deleted_items: deletedItems,
      message: result.statusMessage ?? '',
    };
  },
});
