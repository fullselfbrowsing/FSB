import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { formatDateForUrl } from './schemas.js';

export const searchPackages = defineTool({
  name: 'search_packages',
  displayName: 'Search Vacation Packages',
  description:
    'Navigate to the Expedia vacation packages search page for a flight + hotel bundle. Returns the search URL.',
  summary: 'Navigate to vacation packages search',
  icon: 'package',
  group: 'Packages',
  input: z.object({
    origin: z.string().describe('Origin city or airport code (e.g. "SFO", "San Francisco, CA")'),
    destination: z.string().describe('Destination city or airport code (e.g. "CUN", "Cancun, Mexico")'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().describe('Return date in YYYY-MM-DD format'),
    adults: z.number().int().min(1).max(6).optional().describe('Number of adults (default 2)'),
  }),
  output: z.object({
    search_url: z.string().describe('URL of the vacation packages search page'),
    navigated: z.boolean().describe('Whether the browser was navigated to the search page'),
  }),
  handle: async params => {
    const adults = params.adults ?? 2;
    const depDate = formatDateForUrl(params.departure_date);
    const retDate = formatDateForUrl(params.return_date);

    const url = `/Vacation-Packages-Search?origin=${encodeURIComponent(params.origin)}&destination=${encodeURIComponent(params.destination)}&d1=${encodeURIComponent(depDate)}&d2=${encodeURIComponent(retDate)}&adults=${adults}`;

    window.location.href = url;

    return {
      search_url: `https://www.expedia.com${url}`,
      navigated: true,
    };
  },
});
