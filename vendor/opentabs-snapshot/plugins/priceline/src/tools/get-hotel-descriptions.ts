import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, getCguid } from '../priceline-api.js';
import { type RawHotelDescription, mapHotelDescription, hotelDescriptionSchema } from './schemas.js';

const PERSISTED_HASH = '991edc70fc5972ea86c4db02e07cc45ba1b75fffa12f4b5e2bd3998faaaf70c7';

interface DescriptionResponse {
  hotelInfoByIds?: RawHotelDescription[];
}

export const getHotelDescriptions = defineTool({
  name: 'get_hotel_descriptions',
  displayName: 'Get Hotel Descriptions',
  description:
    'Get AI-generated short descriptions for a batch of hotels by their IDs. Useful for enriching hotel search results with descriptive text. Accepts up to 30 hotel IDs.',
  summary: 'Get short descriptions for hotels',
  icon: 'file-text',
  group: 'Hotels',
  input: z.object({
    hotel_ids: z.array(z.string()).describe('Array of Priceline hotel IDs (max 30)'),
  }),
  output: z.object({
    descriptions: z.array(hotelDescriptionSchema).describe('Hotel descriptions'),
  }),
  handle: async params => {
    const data = await graphql<DescriptionResponse>(
      'getHotelShortDescriptionByIds',
      {
        hotelIds: params.hotel_ids,
        appc: 'DESKTOP',
        cguid: getCguid(),
      },
      PERSISTED_HASH,
    );

    const items = data.hotelInfoByIds ?? [];
    return { descriptions: items.map(mapHotelDescription) };
  },
});
