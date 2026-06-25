import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { formatDateForUrl } from './schemas.js';

export const searchFlights = defineTool({
  name: 'search_flights',
  displayName: 'Search Flights',
  description:
    'Navigate to the Expedia flight search results page for the given route and dates. The user can view and book flights from the results page. Returns the search URL.',
  summary: 'Navigate to flight search results',
  icon: 'plane',
  group: 'Flights',
  input: z.object({
    origin: z.string().describe('Origin airport code or city name (e.g. "SFO", "San Francisco, CA")'),
    destination: z.string().describe('Destination airport code or city name (e.g. "JFK", "New York, NY")'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format (omit for one-way)'),
    adults: z.number().int().min(1).max(6).optional().describe('Number of adults (default 1)'),
    cabin_class: z
      .enum(['coach', 'premium-economy', 'business', 'first'])
      .optional()
      .describe('Cabin class (default "coach")'),
  }),
  output: z.object({
    search_url: z.string().describe('URL of the flight search results page'),
    navigated: z.boolean().describe('Whether the browser was navigated to the search page'),
  }),
  handle: async params => {
    const adults = params.adults ?? 1;
    const depDate = formatDateForUrl(params.departure_date);
    const trip = params.return_date ? 'roundtrip' : 'oneway';

    let legs = `leg1=from:${encodeURIComponent(params.origin)},to:${encodeURIComponent(params.destination)},departure:${encodeURIComponent(depDate)}`;
    if (params.return_date) {
      const retDate = formatDateForUrl(params.return_date);
      legs += `&leg2=from:${encodeURIComponent(params.destination)},to:${encodeURIComponent(params.origin)},departure:${encodeURIComponent(retDate)}`;
    }

    let url = `/Flights-Search?trip=${trip}&${legs}&passengers=adults:${adults}`;
    if (params.cabin_class) {
      url += `&class=${params.cabin_class}`;
    }
    url += '&mode=search';

    window.location.href = url;

    return {
      search_url: `https://www.expedia.com${url}`,
      navigated: true,
    };
  },
});
