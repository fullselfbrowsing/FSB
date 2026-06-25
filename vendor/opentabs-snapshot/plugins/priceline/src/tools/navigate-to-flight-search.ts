import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const tripTypeSchema = z.enum(['OW', 'RT']).describe('Trip type — OW (one-way) or RT (round-trip)');

const cabinClassSchema = z.enum(['ECONOMY', 'PREMIUM', 'BUSINESS', 'FIRST']).describe('Cabin class for the search URL');

const toYmd = (date: string): string => {
  // Accepts YYYY-MM-DD and returns the same format. Validates shape.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date ${date} — expected YYYY-MM-DD`);
  return date;
};

export const navigateToFlightSearch = defineTool({
  name: 'navigate_to_flight_search',
  displayName: 'Navigate to Flight Search',
  description:
    "Open Priceline's flight search results page for a given route and dates in the user's browser. This navigates the current tab so the user can review flights, apply filters, and book in their authenticated session. Use this after get_flight_price_calendar or find_cheapest_flight_date has identified a good route/date — it hands control back to the user for the full search and booking flow. Requires airport/city codes (use search_airports to find them).",
  summary: 'Open Priceline flight search for a route',
  icon: 'plane',
  group: 'Flights',
  input: z.object({
    origin: z.string().describe('Origin airport or city code (e.g., JFK, NYC)'),
    destination: z.string().describe('Destination airport or city code (e.g., LAX, LON)'),
    depart_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format (round-trip only; omit for one-way)'),
    trip_type: tripTypeSchema.optional().describe('Trip type (default OW for one-way, RT when return_date is set)'),
    cabin_class: cabinClassSchema.optional().describe('Cabin class (default ECONOMY)'),
    passengers: z.number().int().min(1).max(8).optional().describe('Number of passengers (default 1)'),
  }),
  output: z.object({
    url: z.string().describe('The Priceline flight search URL that was opened'),
  }),
  handle: async params => {
    const depart = toYmd(params.depart_date);
    const tripType = params.trip_type ?? (params.return_date ? 'RT' : 'OW');
    const cabin = params.cabin_class ?? 'ECONOMY';
    const pax = params.passengers ?? 1;
    const returnSegment = tripType === 'RT' && params.return_date ? `/${toYmd(params.return_date)}` : '';
    const url =
      `https://www.priceline.com/m/fly/search/${params.origin}-${params.destination}/${depart}${returnSegment}/` +
      `?tripType=${tripType}&cabinClass=${cabin}&numOfPassengers=${pax}`;
    window.location.href = url;
    return { url };
  },
});
