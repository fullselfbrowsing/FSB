import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../carta-api.js';

interface FavouriteResponse {
  favouriteId: string;
  isFavourite: boolean;
  userId: number;
}

export const checkFavourite = defineTool({
  name: 'check_favourite',
  displayName: 'Check Favourite',
  description: 'Check whether a company is marked as a favourite in the portfolio.',
  summary: 'Check if company is favourited',
  icon: 'star',
  group: 'Portfolio',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    is_favourite: z.boolean(),
  }),
  handle: async params => {
    const data = await api<FavouriteResponse>(
      `/api/favourites/PORTFOLIO_COMPANIES/is-favourite/${params.corporation_id}/`,
    );
    return { is_favourite: data.isFavourite };
  },
});
