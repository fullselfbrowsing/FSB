import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';
import { type RawLocation, locationSchema, mapLocation } from './schemas.js';

export const searchLocations = defineTool({
  name: 'search_locations',
  displayName: 'Search Locations',
  description:
    'Search for pickup or dropoff locations by text query and coordinates. Returns matching addresses, landmarks, airports, and restaurants. Use the returned place ID with other Uber tools.',
  summary: 'Search for addresses and places',
  icon: 'map-pin',
  group: 'Rides',
  input: z.object({
    query: z.string().describe('Search text (e.g., "SFO", "Golden Gate Bridge", "123 Main St")'),
    latitude: z.number().describe('Latitude for the search center (e.g., 37.7749 for San Francisco)'),
    longitude: z.number().describe('Longitude for the search center (e.g., -122.4194 for San Francisco)'),
    type: z.enum(['PICKUP', 'DROPOFF']).optional().describe('Search type — PICKUP or DROPOFF. Default PICKUP.'),
  }),
  output: z.object({
    locations: z.array(locationSchema),
  }),
  handle: async params => {
    const data = await api<RawLocation[]>('/pudoLocationSearch?localeCode=en', {
      body: {
        latitude: params.latitude,
        longitude: params.longitude,
        query: params.query,
        type: params.type ?? 'PICKUP',
      },
    });
    const locations = Array.isArray(data) ? data : [];
    return { locations: locations.map(mapLocation) };
  },
});
