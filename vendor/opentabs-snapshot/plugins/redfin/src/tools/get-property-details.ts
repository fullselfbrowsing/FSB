import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type RawAboveTheFoldPayload, propertyDetailSchema, mapPropertyDetail } from './schemas.js';

export const getPropertyDetails = defineTool({
  name: 'get_property_details',
  displayName: 'Get Property Details',
  description:
    'Get detailed information about a specific property by its Redfin property ID. Returns address, price, beds/baths, Redfin Estimate, status, and photo count. Use search_properties to find property IDs.',
  summary: 'Get full details for a property',
  icon: 'house',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    property: propertyDetailSchema.describe('Property details'),
  }),
  handle: async params => {
    const data = await api<RawAboveTheFoldPayload>('/stingray/api/home/details/aboveTheFold', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    return { property: mapPropertyDetail(data, params.property_id) };
  },
});
