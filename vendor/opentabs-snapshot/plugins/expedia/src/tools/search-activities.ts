import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { formatDateForUrl } from './schemas.js';

export const searchActivities = defineTool({
  name: 'search_activities',
  displayName: 'Search Activities',
  description:
    'Navigate to the Expedia activities/things to do search results page for a destination. Returns the search URL.',
  summary: 'Navigate to activities search results',
  icon: 'ticket',
  group: 'Activities',
  input: z.object({
    destination: z.string().describe('Destination name (e.g. "New York", "Paris")'),
    region_id: z.string().optional().describe('Gaia region ID from search_locations for more precise results'),
    start_date: z.string().optional().describe('Start date in YYYY-MM-DD format'),
    end_date: z.string().optional().describe('End date in YYYY-MM-DD format'),
  }),
  output: z.object({
    search_url: z.string().describe('URL of the activities search results page'),
    navigated: z.boolean().describe('Whether the browser was navigated to the search page'),
  }),
  handle: async params => {
    let url = `/Activities-Search?location=${encodeURIComponent(params.destination)}`;

    if (params.region_id) {
      url += `&regionId=${encodeURIComponent(params.region_id)}`;
    }
    if (params.start_date) {
      url += `&startDate=${formatDateForUrl(params.start_date)}`;
    }
    if (params.end_date) {
      url += `&endDate=${formatDateForUrl(params.end_date)}`;
    }

    window.location.href = url;

    return {
      search_url: `https://www.expedia.com${url}`,
      navigated: true,
    };
  },
});
