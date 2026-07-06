import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, getCguid } from '../priceline-api.js';

const PERSISTED_HASH = 'bd547859ce08366e86541b80eb6951d93aa36e1e4608842366309826793c223f';

interface AbandonedItem {
  type?: string;
  hotelName?: string;
  hotelId?: string;
  cityName?: string;
  checkIn?: string;
  checkOut?: string;
  price?: number;
}

interface AbandonedResponse {
  getAbandonedItemsByCguid?: AbandonedItem[];
}

export const getAbandonedItems = defineTool({
  name: 'get_abandoned_items',
  displayName: 'Get Abandoned Items',
  description:
    'Get items the user previously viewed or added to cart but did not complete booking. Useful for resuming interrupted booking flows.',
  summary: 'Get your abandoned cart items',
  icon: 'shopping-cart',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    items: z
      .array(
        z.object({
          type: z.string().describe('Item type (HOTEL, FLIGHT, CAR)'),
          hotel_name: z.string().describe('Hotel name (if hotel)'),
          hotel_id: z.string().describe('Hotel ID (if hotel)'),
          city_name: z.string().describe('City name'),
          check_in: z.string().describe('Check-in date'),
          check_out: z.string().describe('Check-out date'),
          price: z.number().describe('Price at time of abandonment'),
        }),
      )
      .describe('Abandoned booking items'),
  }),
  handle: async () => {
    const data = await graphql<AbandonedResponse>('getAbandonedItemsByCguid', { cguid: getCguid() }, PERSISTED_HASH);

    const items = data.getAbandonedItemsByCguid ?? [];
    return {
      items: items.map(item => ({
        type: item.type ?? '',
        hotel_name: item.hotelName ?? '',
        hotel_id: item.hotelId ?? '',
        city_name: item.cityName ?? '',
        check_in: item.checkIn ?? '',
        check_out: item.checkOut ?? '',
        price: item.price ?? 0,
      })),
    };
  },
});
