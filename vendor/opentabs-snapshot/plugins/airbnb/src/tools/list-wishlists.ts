import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';
import { wishlistSchema, mapWishlist } from './schemas.js';

export const listWishlists = defineTool({
  name: 'list_wishlists',
  displayName: 'List Wishlists',
  description:
    "List the current user's wishlists with pagination. Returns wishlist names, privacy settings, dates, and listing counts.",
  summary: 'List wishlists for the current user',
  icon: 'heart',
  group: 'Wishlists',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of wishlists to return (default 12)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    wishlists: z.array(wishlistSchema).describe('List of wishlists'),
  }),
  handle: async params => {
    const limit = params.limit ?? 12;
    const offset = params.offset ?? 0;

    const data = await graphql<{
      presentation: {
        wishlistIndexPage: {
          wishlists: Array<Record<string, unknown>>;
        };
      };
    }>('WishlistIndexPageQuery', QUERY_HASHES.WishlistIndexPageQuery, {
      limit,
      offset,
      treatmentFlags: ['wishlist_should_load_service'],
    });

    const wishlists = data.presentation.wishlistIndexPage.wishlists ?? [];

    return {
      wishlists: wishlists.map(mapWishlist),
    };
  },
});
