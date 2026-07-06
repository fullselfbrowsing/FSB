import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../priceline-api.js';
import { type RawFlightFareRecord, flightFareRecordSchema, mapFlightFareRecord } from './schemas.js';

const PRICE_CALENDAR_QUERY = `
  query airPriceGuideCalendar($input: AirPriceGuideRequest) {
    airPriceGuide(input: $input) {
      error { type code message }
      records {
        dates
        minimumFare {
          isPrivateFare
          currency
          amtPerPax
          commonAttributes { takeOffTimes landingTimes }
          listOfStops { sliceId stops }
        }
      }
    }
  }`;

interface RawPriceGuideResponse {
  airPriceGuide?: {
    error?: { type?: string; code?: string; message?: string } | null;
    records?: RawFlightFareRecord[] | null;
  };
}

export const findCheapestFlightDate = defineTool({
  name: 'find_cheapest_flight_date',
  displayName: 'Find Cheapest Flight Date',
  description:
    'Find the single cheapest date to fly a route within a given date window. Returns the bottom N fares ordered from lowest to highest price, so the caller can pick the best date that fits their schedule. Works for one-way routes; for round-trip price optimization use get_flight_price_calendar with two trips.',
  summary: 'Find the cheapest flight date in a window',
  icon: 'piggy-bank',
  group: 'Flights',
  input: z.object({
    origin: z.string().describe('Origin airport or city code (e.g., JFK, NYC)'),
    destination: z.string().describe('Destination airport or city code (e.g., LAX, LON)'),
    depart_date_from: z.string().describe('Start of departure window in YYYY-MM-DD format'),
    depart_date_to: z.string().describe('End of departure window in YYYY-MM-DD format'),
    top_n: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Number of cheapest dates to return (default 5, max 30)'),
    cabin_class: z.enum(['ECO', 'PREMIUM', 'BUS', 'FIRST']).optional().describe('Cabin class filter (default ECO)'),
  }),
  output: z.object({
    records: z.array(flightFareRecordSchema).describe('Cheapest flight dates in the window, sorted ascending by price'),
  }),
  handle: async params => {
    const variables = {
      input: {
        trips: [
          {
            originCity: [params.origin],
            destinationCity: [params.destination],
            departDateRange: { fromDate: params.depart_date_from, toDate: params.depart_date_to },
          },
        ],
        size: 720,
        consumer: 'PCLN-HOME',
        cabinClass: params.cabin_class ?? 'ECO',
      },
    };
    const data = await graphql<RawPriceGuideResponse>('airPriceGuideCalendar', variables, PRICE_CALENDAR_QUERY);
    const guide = data.airPriceGuide;
    if (guide?.error) {
      const msg = guide.error.message ?? '';
      if (msg === 'Zero results') return { records: [] };
      throw ToolError.internal(`Flight price calendar error: ${msg}`);
    }
    const raw = guide?.records ?? [];
    const mapped = raw
      .map(mapFlightFareRecord)
      .filter(r => r.min_price > 0)
      .sort((a, b) => a.min_price - b.min_price)
      .slice(0, params.top_n ?? 5);
    return { records: mapped };
  },
});
