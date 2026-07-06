import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';

interface BookmarkResponse {
  bookmarkStore: boolean;
}

export const bookmarkStore = defineTool({
  name: 'bookmark_store',
  displayName: 'Bookmark Store',
  description: 'Save a store to your bookmarked/favorite stores list on DoorDash.',
  summary: 'Save a store as a favorite',
  icon: 'bookmark-plus',
  group: 'Stores',
  input: z.object({
    store_id: z.string().describe('Store ID to bookmark'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the store was bookmarked successfully'),
  }),
  handle: async params => {
    const data = await gql<BookmarkResponse>(
      'bookmarkStore',
      'mutation bookmarkStore($storeId: ID!) { bookmarkStore(storeId: $storeId) }',
      { storeId: params.store_id },
    );
    return { success: data.bookmarkStore ?? false };
  },
});
