import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { formatDateForUrl } from './schemas.js';

export const navigateToHotel = defineTool({
  name: 'navigate_to_hotel',
  displayName: 'Navigate to Hotel',
  description:
    'Navigate the browser to an Expedia hotel detail page. The user can view full hotel information, photos, reviews, room options, and proceed to booking.',
  summary: 'Open a hotel detail page in the browser',
  icon: 'building-2',
  group: 'Hotels',
  input: z.object({
    hotel_name: z.string().describe('Hotel name to search for on Expedia'),
    region_id: z.string().optional().describe('Gaia region ID for the destination (from search_locations)'),
    check_in_date: z.string().optional().describe('Check-in date in YYYY-MM-DD format'),
    check_out_date: z.string().optional().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().int().min(1).max(14).optional().describe('Number of adults (default 2)'),
  }),
  output: z.object({
    search_url: z.string().describe('URL of the hotel search with the hotel name'),
    navigated: z.boolean().describe('Whether the browser was navigated'),
  }),
  handle: async params => {
    let url = `/Hotel-Search?destination=${encodeURIComponent(params.hotel_name)}`;

    if (params.region_id) {
      url += `&regionId=${encodeURIComponent(params.region_id)}`;
    }
    if (params.check_in_date) {
      url += `&startDate=${formatDateForUrl(params.check_in_date)}`;
    }
    if (params.check_out_date) {
      url += `&endDate=${formatDateForUrl(params.check_out_date)}`;
    }

    const adults = params.adults ?? 2;
    url += `&rooms=1&adults=${adults}`;

    window.location.href = url;

    return {
      search_url: `https://www.expedia.com${url}`,
      navigated: true,
    };
  },
});
