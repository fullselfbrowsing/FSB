import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { formatDateForUrl } from './schemas.js';

export const searchCarRentals = defineTool({
  name: 'search_car_rentals',
  displayName: 'Search Car Rentals',
  description:
    'Navigate to the Expedia car rental search results page for the given location and dates. Returns the search URL.',
  summary: 'Navigate to car rental search results',
  icon: 'car',
  group: 'Cars',
  input: z.object({
    pickup_location: z.string().describe('Pickup location airport code or city (e.g. "LAX", "Los Angeles, CA")'),
    pickup_date: z.string().describe('Pickup date in YYYY-MM-DD format'),
    dropoff_date: z.string().describe('Drop-off date in YYYY-MM-DD format'),
    pickup_time: z.string().optional().describe('Pickup time in HH:MM format, 24-hour (default "10:00")'),
    dropoff_time: z.string().optional().describe('Drop-off time in HH:MM format, 24-hour (default "10:00")'),
  }),
  output: z.object({
    search_url: z.string().describe('URL of the car rental search results page'),
    navigated: z.boolean().describe('Whether the browser was navigated to the search page'),
  }),
  handle: async params => {
    const pickupDate = formatDateForUrl(params.pickup_date);
    const dropoffDate = formatDateForUrl(params.dropoff_date);
    const pickupTime = params.pickup_time ?? '10:00';
    const dropoffTime = params.dropoff_time ?? '10:00';

    const url = `/Cars-Search?loc=${encodeURIComponent(params.pickup_location)}&date1=${encodeURIComponent(pickupDate)}&date2=${encodeURIComponent(dropoffDate)}&time1=${encodeURIComponent(pickupTime)}&time2=${encodeURIComponent(dropoffTime)}`;

    window.location.href = url;

    return {
      search_url: `https://www.expedia.com${url}`,
      navigated: true,
    };
  },
});
