import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToSearch = defineTool({
  name: 'navigate_to_search',
  displayName: 'Navigate to Hotel Search',
  description:
    'Navigate the browser to Priceline hotel search results for a given city and dates. This opens the search results page where the user can browse, filter, and select hotels.',
  summary: 'Open hotel search results page',
  icon: 'search',
  group: 'Search',
  input: z.object({
    location_id: z.string().describe('Priceline city or location ID'),
    check_in: z.string().describe('Check-in date in YYYYMMDD format'),
    check_out: z.string().describe('Check-out date in YYYYMMDD format'),
    adults: z.number().int().min(1).optional().describe('Number of adults (default 2)'),
    rooms: z.number().int().min(1).optional().describe('Number of rooms (default 1)'),
  }),
  output: z.object({
    url: z.string().describe('The search results page URL'),
    success: z.boolean().describe('Whether navigation was initiated'),
  }),
  handle: async params => {
    const adults = params.adults ?? 2;
    const rooms = params.rooms ?? 1;
    const url = `https://www.priceline.com/relax/in/${params.location_id}/from/${params.check_in}/to/${params.check_out}/rooms/${rooms}/adults/${adults}`;

    globalThis.location.href = url;

    return { url, success: true };
  },
});
