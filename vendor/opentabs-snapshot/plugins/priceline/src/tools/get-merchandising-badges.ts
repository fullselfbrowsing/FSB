import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../priceline-api.js';
import { type RawMerchandisingEntity, mapMerchandisingBadge, merchandisingBadgeSchema } from './schemas.js';

const PERSISTED_HASH = '2af5883a5e9daed74af8585efd7e2995acab8c132e9c9bff7095c0412d6a6157';

interface MerchandisingResponse {
  merchandising?: {
    merchandisingEntities?: RawMerchandisingEntity[];
  };
}

export const getMerchandisingBadges = defineTool({
  name: 'get_merchandising_badges',
  displayName: 'Get Merchandising Badges',
  description:
    'Get merchandising badges (top-rated, top-booked) for a batch of hotels. Useful for highlighting popular or highly rated hotels in search results.',
  summary: 'Get top-rated/top-booked badges for hotels',
  icon: 'badge',
  group: 'Hotels',
  input: z.object({
    hotel_ids: z.array(z.string()).describe('Array of Priceline hotel IDs'),
  }),
  output: z.object({
    badges: z.array(merchandisingBadgeSchema).describe('Merchandising badges per hotel'),
  }),
  handle: async params => {
    const data = await graphql<MerchandisingResponse>(
      'getMerchandisingData',
      {
        addErrToResponse: true,
        appCode: 'DESKTOP',
        entityIds: params.hotel_ids,
        entityType: 'HOTEL',
      },
      PERSISTED_HASH,
    );

    const entities = data.merchandising?.merchandisingEntities ?? [];
    return { badges: entities.map(mapMerchandisingBadge) };
  },
});
