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

const cabinClassSchema = z
  .enum(['ECO', 'PREMIUM', 'BUS', 'FIRST'])
  .describe('Cabin class — ECO (economy), PREMIUM (premium economy), BUS (business), FIRST (first)');

const tripSchema = z
  .object({
    origin: z.string().describe('Origin airport/city code (e.g., JFK, NYC)'),
    destination: z.string().describe('Destination airport/city code (e.g., LAX, LON)'),
    depart_date: z
      .string()
      .optional()
      .describe('Single departure date in YYYY-MM-DD format. Provide either this or depart_date_range, not both.'),
    depart_date_from: z
      .string()
      .optional()
      .describe('Start of departure date window in YYYY-MM-DD format. Pair with depart_date_to for range searches.'),
    depart_date_to: z
      .string()
      .optional()
      .describe('End of departure date window in YYYY-MM-DD format. Pair with depart_date_from for range searches.'),
  })
  .describe('A single flight slice (leg). For one-way pass one slice; for round-trip pass two (outbound + return).');

interface RawPriceGuideResponse {
  airPriceGuide?: {
    error?: { type?: string; code?: string; message?: string } | null;
    records?: RawFlightFareRecord[] | null;
  };
}

interface GqlTrip {
  originCity: [string];
  destinationCity: [string];
  departDate?: string;
  departDateRange?: { fromDate: string; toDate: string };
}

const buildTrip = (t: z.infer<typeof tripSchema>): GqlTrip => {
  const trip: GqlTrip = {
    originCity: [t.origin],
    destinationCity: [t.destination],
  };
  if (t.depart_date_from && t.depart_date_to) {
    trip.departDateRange = { fromDate: t.depart_date_from, toDate: t.depart_date_to };
  } else if (t.depart_date) {
    trip.departDate = t.depart_date;
  } else {
    throw ToolError.validation('Each trip must have either depart_date or both depart_date_from and depart_date_to.');
  }
  return trip;
};

export const getFlightPriceCalendar = defineTool({
  name: 'get_flight_price_calendar',
  displayName: 'Get Flight Price Calendar',
  description:
    "Get Priceline's fare forecast for a route over a date range. Returns the cheapest available fare for each date (or date combination for round-trips), along with departure/arrival times and stop counts. Pass a single `trips` entry for one-way, or two entries (outbound + return) for round-trip. Each trip can be a single date (`depart_date`) or a date window (`depart_date_from`/`depart_date_to`). Useful for finding the cheapest date to fly before booking.",
  summary: 'Flight fare forecast for a date range',
  icon: 'calendar-range',
  group: 'Flights',
  input: z.object({
    trips: z
      .array(tripSchema)
      .min(1)
      .max(6)
      .describe('Flight slices — 1 for one-way, 2 for round-trip, up to 6 for multi-city'),
    cabin_class: cabinClassSchema.optional().describe('Cabin class filter (default ECO)'),
  }),
  output: z.object({
    records: z.array(flightFareRecordSchema).describe('Cheapest fares by date combination, sorted by trip dates'),
  }),
  handle: async params => {
    const variables = {
      input: {
        trips: params.trips.map(buildTrip),
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
    const records = guide?.records ?? [];
    return { records: records.map(mapFlightFareRecord) };
  },
});
