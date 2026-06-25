import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type RawComparableRental, comparableRentalSchema, mapComparableRental } from './schemas.js';

interface ComparableRentalsPayload {
  homes?: RawComparableRental[];
  numMatchedHomes?: number;
}

export const getComparableRentals = defineTool({
  name: 'get_comparable_rentals',
  displayName: 'Get Comparable Rentals',
  description:
    'Find comparable rental listings near a property. Requires the property coordinates and an estimated rent value. Use get_property_details to get the latitude and longitude first.',
  summary: 'Find comparable rental listings nearby',
  icon: 'key',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
    latitude: z.number().describe('Property latitude'),
    longitude: z.number().describe('Property longitude'),
    rent_estimate: z.number().optional().describe('Estimated monthly rent in dollars (default 3000)'),
  }),
  output: z.object({
    rentals: z.array(comparableRentalSchema).describe('Comparable rental listings'),
    total_matched: z.number().describe('Total number of matched rentals'),
  }),
  handle: async params => {
    const estimate = params.rent_estimate ?? 3000;
    const data = await api<ComparableRentalsPayload>('/stingray/api/home/comparable-rentals', {
      query: {
        propertyId: params.property_id,
        latitude: params.latitude,
        longitude: params.longitude,
        rentEstimateLow: estimate,
        rentEstimateHigh: estimate,
      },
    });

    return {
      rentals: (data.homes ?? []).map(mapComparableRental),
      total_matched: data.numMatchedHomes ?? 0,
    };
  },
});
