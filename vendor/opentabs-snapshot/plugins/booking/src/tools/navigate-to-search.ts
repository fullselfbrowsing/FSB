import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { buildSearchUrl } from '../booking-api.js';

export const navigateToSearch = defineTool({
  name: 'navigate_to_search',
  displayName: 'Navigate to Search',
  description:
    'Navigate the browser to the Booking.com search results page for a given destination and dates. The user can then browse, filter, and book properties visually.',
  summary: 'Open search results in the browser',
  icon: 'map',
  group: 'Navigation',
  input: z.object({
    destination: z.string().describe('Destination city, region, or property name'),
    checkin: z.string().describe('Check-in date in YYYY-MM-DD format'),
    checkout: z.string().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().int().min(1).max(30).optional().describe('Number of adults (default 2)'),
    rooms: z.number().int().min(1).max(30).optional().describe('Number of rooms (default 1)'),
  }),
  output: z.object({
    url: z.string().describe('The URL navigated to'),
    success: z.boolean().describe('Whether the navigation succeeded'),
  }),
  handle: async params => {
    const path = buildSearchUrl({
      destination: params.destination,
      checkin: params.checkin,
      checkout: params.checkout,
      adults: params.adults,
      rooms: params.rooms,
    });
    const url = `https://www.booking.com${path}`;
    window.location.href = url;
    return { url, success: true };
  },
});
