import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';

interface UnbookmarkResponse {
  unbookmarkStore: boolean;
}

export const unbookmarkStore = defineTool({
  name: 'unbookmark_store',
  displayName: 'Unbookmark Store',
  description: 'Remove a store from your bookmarked/favorite stores list on DoorDash.',
  summary: 'Remove a store from favorites',
  icon: 'bookmark-minus',
  group: 'Stores',
  input: z.object({
    store_id: z.string().describe('Store ID to unbookmark'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the store was unbookmarked successfully'),
  }),
  handle: async params => {
    const data = await gql<UnbookmarkResponse>(
      'unbookmarkStore',
      'mutation unbookmarkStore($storeId: ID!) { unbookmarkStore(storeId: $storeId) }',
      { storeId: params.store_id },
    );
    return { success: data.unbookmarkStore ?? false };
  },
});
