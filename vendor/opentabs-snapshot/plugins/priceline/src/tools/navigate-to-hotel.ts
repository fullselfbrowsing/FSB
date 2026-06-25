import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToHotel = defineTool({
  name: 'navigate_to_hotel',
  displayName: 'Navigate to Hotel',
  description:
    "Navigate the browser to a specific hotel's detail page on Priceline. This opens the hotel page where the user can view full details, room options, and book. Requires a hotel ID from search_hotels results and the same date/occupancy parameters.",
  summary: 'Open a hotel detail page',
  icon: 'external-link',
  group: 'Hotels',
  input: z.object({
    hotel_id: z.string().describe('Priceline hotel ID from search results'),
    check_in: z.string().describe('Check-in date in YYYYMMDD format'),
    check_out: z.string().describe('Check-out date in YYYYMMDD format'),
    adults: z.number().int().min(1).optional().describe('Number of adults (default 2)'),
    rooms: z.number().int().min(1).optional().describe('Number of rooms (default 1)'),
  }),
  output: z.object({
    url: z.string().describe('The hotel detail page URL'),
    success: z.boolean().describe('Whether navigation was initiated'),
  }),
  handle: async params => {
    const adults = params.adults ?? 2;
    const rooms = params.rooms ?? 1;
    const url = `https://www.priceline.com/hotel-deals/h${params.hotel_id}/from/${params.check_in}/to/${params.check_out}/rooms/${rooms}/adults/${adults}`;

    globalThis.location.href = url;

    return { url, success: true };
  },
});
