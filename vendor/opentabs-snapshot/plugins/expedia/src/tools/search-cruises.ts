import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const searchCruises = defineTool({
  name: 'search_cruises',
  displayName: 'Search Cruises',
  description: 'Navigate to the Expedia cruise search page for the given destination. Returns the search URL.',
  summary: 'Navigate to cruise search results',
  icon: 'ship',
  group: 'Cruises',
  input: z.object({
    destination: z.string().optional().describe('Cruise destination (e.g. "Caribbean", "Alaska", "Mediterranean")'),
    departure_month: z.string().optional().describe('Departure month in YYYY-MM format (e.g. "2026-06")'),
  }),
  output: z.object({
    search_url: z.string().describe('URL of the cruise search page'),
    navigated: z.boolean().describe('Whether the browser was navigated'),
  }),
  handle: async params => {
    let url = '/Cruise-Search';
    const queryParts: string[] = [];

    if (params.destination) {
      queryParts.push(`destination=${encodeURIComponent(params.destination)}`);
    }
    if (params.departure_month) {
      queryParts.push(`departureMonth=${encodeURIComponent(params.departure_month)}`);
    }

    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`;
    }

    window.location.href = url;

    return {
      search_url: `https://www.expedia.com${url}`,
      navigated: true,
    };
  },
});
