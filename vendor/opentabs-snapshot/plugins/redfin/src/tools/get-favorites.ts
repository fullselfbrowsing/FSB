import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import {
  type RawFavoriteOnMarket,
  type RawFavoriteOffMarket,
  favoriteSchema,
  mapFavoriteOnMarket,
  mapFavoriteOffMarket,
} from './schemas.js';

interface FavoritesPayload {
  onMarket?: RawFavoriteOnMarket[];
  offMarket?: RawFavoriteOffMarket[];
}

export const getFavorites = defineTool({
  name: 'get_favorites',
  displayName: 'Get Favorites',
  description:
    "Get the current user's favorited/saved homes, separated into on-market (active listings) and off-market properties.",
  summary: 'Get saved/favorited homes',
  icon: 'heart',
  group: 'Account',
  input: z.object({
    market_status: z
      .enum(['all', 'on_market', 'off_market'])
      .optional()
      .describe('Filter by market status (default "all")'),
  }),
  output: z.object({
    favorites: z.array(favoriteSchema).describe('Favorited properties'),
    on_market_count: z.number().describe('Number of on-market favorites'),
    off_market_count: z.number().describe('Number of off-market favorites'),
  }),
  handle: async params => {
    const data = await api<FavoritesPayload>('/stingray/do/api-get-favorites');

    const filter = params.market_status ?? 'all';
    const onMarket = (data.onMarket ?? []).map(mapFavoriteOnMarket);
    const offMarket = (data.offMarket ?? []).map(mapFavoriteOffMarket);

    let favorites: ReturnType<typeof mapFavoriteOnMarket>[];
    if (filter === 'on_market') favorites = onMarket;
    else if (filter === 'off_market') favorites = offMarket;
    else favorites = [...onMarket, ...offMarket];

    return {
      favorites,
      on_market_count: onMarket.length,
      off_market_count: offMarket.length,
    };
  },
});
