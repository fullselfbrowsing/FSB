import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache } from '../booking-api.js';
import { tripSchema } from './schemas.js';

export const listTrips = defineTool({
  name: 'list_trips',
  displayName: 'List Trips',
  description:
    "List the current user's trips and bookings on Booking.com. Returns upcoming and past bookings with property details, dates, and status.",
  summary: 'List user trips and bookings',
  icon: 'luggage',
  group: 'Trips',
  input: z.object({}),
  output: z.object({
    trips: z.array(tripSchema).describe('List of user trips/bookings'),
  }),
  handle: async () => {
    const doc = await fetchPage('/trips');
    const cache = extractApolloCache(doc);

    if (!cache?.ROOT_QUERY) return { trips: [] };

    // Trips data is in the Apollo cache under various trip-related keys
    const rootQuery = cache.ROOT_QUERY;
    const trips: Array<{
      id: string;
      property_name: string;
      property_id: number;
      city: string;
      country: string;
      checkin: string;
      checkout: string;
      status: string;
      photo_url: string;
      url: string;
    }> = [];

    for (const [key, value] of Object.entries(rootQuery)) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;

      // Look for trip list data
      if (key.includes('tripList') || key.includes('tripsQueries') || v.__typename === 'TripsQueries') {
        const tripList = (v.tripList ?? v) as Record<string, unknown>;
        const timelines = (tripList.timelines ?? []) as Array<Record<string, unknown>>;

        for (const timeline of timelines) {
          const items = (timeline.items ?? []) as Array<Record<string, unknown>>;
          for (const item of items) {
            const booking = (item.booking ?? item) as Record<string, unknown>;
            const property = (booking.property ?? booking.accommodation ?? {}) as Record<string, unknown>;
            const dates = (booking.dates ?? {}) as Record<string, string>;

            trips.push({
              id: String(booking.bookingNumber ?? booking.id ?? ''),
              property_name: String(property.name ?? booking.propertyName ?? ''),
              property_id: Number(property.id ?? booking.propertyId ?? 0),
              city: String(property.city ?? booking.city ?? ''),
              country: String(property.country ?? booking.countryName ?? ''),
              checkin: dates.checkin ?? String(booking.checkin ?? ''),
              checkout: dates.checkout ?? String(booking.checkout ?? ''),
              status: String(booking.status ?? booking.bookingStatus ?? ''),
              photo_url: String(property.photoUrl ?? property.imageUrl ?? ''),
              url: booking.bookingNumber ? `https://secure.booking.com/mybooking.html?bn=${booking.bookingNumber}` : '',
            });
          }
        }
      }
    }

    // If no structured trip data found, scan the full cache for booking entities
    if (trips.length === 0) {
      for (const [key, value] of Object.entries(cache)) {
        if (!key.startsWith('ROOT_QUERY') && typeof value === 'object' && value !== null) {
          const v = value as Record<string, unknown>;
          if (v.__typename === 'Trip' || v.__typename === 'Booking' || v.__typename === 'TripItem') {
            trips.push({
              id: String(v.bookingNumber ?? v.id ?? key),
              property_name: String(v.propertyName ?? v.name ?? ''),
              property_id: Number(v.propertyId ?? v.hotelId ?? 0),
              city: String(v.city ?? ''),
              country: String(v.country ?? ''),
              checkin: String(v.checkin ?? ''),
              checkout: String(v.checkout ?? ''),
              status: String(v.status ?? ''),
              photo_url: String(v.photoUrl ?? v.imageUrl ?? ''),
              url: v.bookingNumber ? `https://secure.booking.com/mybooking.html?bn=${v.bookingNumber}` : '',
            });
          }
        }
      }
    }

    return { trips };
  },
});
