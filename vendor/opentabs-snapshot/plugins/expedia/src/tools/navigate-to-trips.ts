import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToTrips = defineTool({
  name: 'navigate_to_trips',
  displayName: 'Navigate to Trips',
  description: 'Navigate the browser to the Expedia trips page where the user can view and manage their bookings.',
  summary: 'Open the trips/bookings page',
  icon: 'luggage',
  group: 'Trips',
  input: z.object({}),
  output: z.object({
    url: z.string().describe('URL of the trips page'),
    navigated: z.boolean().describe('Whether the browser was navigated'),
  }),
  handle: async () => {
    window.location.href = '/trips';
    return {
      url: 'https://www.expedia.com/trips',
      navigated: true,
    };
  },
});
