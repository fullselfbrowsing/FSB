import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { autocomplete } from '../priceline-api.js';
import { type RawAirport, airportSchema, mapAirport } from './schemas.js';

export const searchAirports = defineTool({
  name: 'search_airports',
  displayName: 'Search Airports',
  description:
    'Find airports and multi-airport metro areas matching a keyword. Returns IATA codes (e.g., JFK, LAX) for specific airports and three-letter city codes (e.g., NYC, LON) for metros that combine all nearby airports. Use the returned `id` value as the origin or destination code in other flight tools. Results are ranked by relevance.',
  summary: 'Find airport and city codes by keyword',
  icon: 'plane-takeoff',
  group: 'Flights',
  input: z.object({
    keyword: z
      .string()
      .describe('Search keyword — a city name, airport name, or IATA code (e.g., "new york", "heathrow", "JFK")'),
  }),
  output: z.object({
    airports: z.array(airportSchema).describe('Matching airports and metro areas ranked by relevance'),
  }),
  handle: async params => {
    const items = await autocomplete<RawAirport>('flights', params.keyword);
    return { airports: items.map(mapAirport) };
  },
});
