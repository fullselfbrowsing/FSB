import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, getCguid } from '../priceline-api.js';

const PERSISTED_HASH = '4fad539cf5e897fb10f0cd40b6f71f1d91562a2adb8142c2be02998641bd50da';

interface FavoritesResponse {
  favoriteHotelsByCityId?: Array<{
    hotelId?: string;
    hotelName?: string;
  }>;
}

export const getFavoriteHotels = defineTool({
  name: 'get_favorite_hotels',
  displayName: 'Get Favorite Hotels',
  description:
    "Get the user's favorite (saved) hotels in a specific city. Returns hotel IDs and names that the user has previously marked as favorites.",
  summary: 'Get your saved hotels in a city',
  icon: 'heart',
  group: 'Account',
  input: z.object({
    city_id: z.number().int().describe('Priceline city ID (numeric)'),
  }),
  output: z.object({
    favorites: z
      .array(
        z.object({
          hotel_id: z.string().describe('Hotel ID'),
          hotel_name: z.string().describe('Hotel name'),
        }),
      )
      .describe('Favorite hotels in the city'),
  }),
  handle: async params => {
    const data = await graphql<FavoritesResponse>(
      'FavoriteHotelsByCityId',
      {
        cityIds: params.city_id,
        cguid: getCguid(),
      },
      PERSISTED_HASH,
    );

    const items = data.favoriteHotelsByCityId ?? [];
    return {
      favorites: items.map(f => ({
        hotel_id: f.hotelId ?? '',
        hotel_name: f.hotelName ?? '',
      })),
    };
  },
});
