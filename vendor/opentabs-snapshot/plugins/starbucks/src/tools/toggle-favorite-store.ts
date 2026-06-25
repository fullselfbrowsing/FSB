import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../starbucks-api.js';

export const toggleFavoriteStore = defineTool({
  name: 'toggle_favorite_store',
  displayName: 'Toggle Favorite Store',
  description: 'Add or remove a Starbucks store from your favorites list. Use find_stores to discover store IDs.',
  summary: 'Add or remove a store from favorites',
  icon: 'heart',
  group: 'Stores',
  input: z.object({
    store_number: z
      .string()
      .describe(
        'Store number (the internal store ID, e.g., "1028036"). Available from find_stores results as store_id.',
      ),
    favorite: z.boolean().describe('true to add to favorites, false to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    if (params.favorite) {
      await api('/stores/favorites', {
        method: 'POST',
        body: { storeNumber: params.store_number },
      });
    } else {
      await api(`/stores/favorites/${params.store_number}`, {
        method: 'DELETE',
      });
    }
    return { success: true };
  },
});
