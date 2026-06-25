import { defineTool, getPageGlobal, getCurrentUrl } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resolveRef } from '../expedia-api.js';
import { tripSchema, mapTrip } from './schemas.js';
import type { RawTripCard } from './schemas.js';

export const listTrips = defineTool({
  name: 'list_trips',
  displayName: 'List Trips',
  description:
    'List the user\'s trips on Expedia. Reads trip data from the currently loaded trips page. If not on the trips page, navigates to it first. Filter by trip type: "BOOKED" for confirmed bookings, "PLANNED" for saved/planned trips.',
  summary: 'List booked or planned trips',
  icon: 'luggage',
  group: 'Trips',
  input: z.object({
    trip_type: z.enum(['BOOKED', 'PLANNED']).optional().describe('Trip type filter (default "BOOKED")'),
  }),
  output: z.object({
    trip_type: z.string().describe('The trip type filter used'),
    is_empty: z.boolean().describe('Whether the trip list is empty'),
    empty_message: z.string().describe('Message shown when no trips exist'),
    trips: z.array(tripSchema).describe('Trip cards'),
    on_trips_page: z.boolean().describe('Whether the browser is on the trips page'),
  }),
  handle: async params => {
    const tripType = params.trip_type ?? 'BOOKED';
    const currentUrl = getCurrentUrl();
    const onTripsPage = currentUrl.includes('/trips');

    if (!onTripsPage) {
      window.location.href = '/trips';
      return {
        trip_type: tripType,
        is_empty: false,
        empty_message: '',
        trips: [],
        on_trips_page: false,
      };
    }

    // Read trip data from the hydrated Apollo state on the trips page
    const apolloState = getPageGlobal('__APOLLO_STATE__') as Record<string, unknown> | undefined;
    if (!apolloState) {
      return {
        trip_type: tripType,
        is_empty: true,
        empty_message: 'Trip data not yet loaded. Try again in a few seconds.',
        trips: [],
        on_trips_page: true,
      };
    }

    const rootQuery = apolloState.ROOT_QUERY as Record<string, unknown> | undefined;
    if (!rootQuery) {
      return {
        trip_type: tripType,
        is_empty: true,
        empty_message: 'No trip data available',
        trips: [],
        on_trips_page: true,
      };
    }

    // Find the tripList entry matching the requested tripType
    const tripListKey = Object.keys(rootQuery).find(
      k => k.includes('tripList') && k.includes(`"tripType":"${tripType}"`),
    );

    if (!tripListKey) {
      return {
        trip_type: tripType,
        is_empty: true,
        empty_message: 'No trips found for this type',
        trips: [],
        on_trips_page: true,
      };
    }

    const resolved = resolveRef(rootQuery[tripListKey], apolloState) as Record<string, unknown>;
    const typeName = resolved?.__typename as string | undefined;
    const isEmpty = typeName === 'TripsUITripListEmptyState';

    if (isEmpty) {
      return {
        trip_type: tripType,
        is_empty: true,
        empty_message: (resolved?.primary as string) ?? 'No bookings yet',
        trips: [],
        on_trips_page: true,
      };
    }

    // Extract trip cards
    const trips: RawTripCard[] = [];
    for (const [key, value] of Object.entries(resolved)) {
      if (key.startsWith('__')) continue;
      if (value && typeof value === 'object') {
        const val = value as Record<string, unknown>;
        if (val.__typename && String(val.__typename).includes('Trip')) {
          trips.push(val as unknown as RawTripCard);
        }
      }
    }

    return {
      trip_type: tripType,
      is_empty: trips.length === 0,
      empty_message: trips.length === 0 ? 'No trips found' : '',
      trips: trips.map(mapTrip),
      on_trips_page: true,
    };
  },
});
