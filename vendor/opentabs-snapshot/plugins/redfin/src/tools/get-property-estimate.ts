import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type RawAvmPayload, estimateSchema, comparableSchema, mapEstimate, mapComparable } from './schemas.js';

export const getPropertyEstimate = defineTool({
  name: 'get_property_estimate',
  displayName: 'Get Property Estimate',
  description:
    'Get the Redfin Estimate (automated home valuation) for a property, along with comparable properties used to determine the estimate. The Redfin Estimate is a proprietary AVM that predicts current market value.',
  summary: 'Get Redfin Estimate and comparable homes',
  icon: 'badge-dollar-sign',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    estimate: estimateSchema.describe('Home value estimate'),
    comparables: z.array(comparableSchema).describe('Comparable properties'),
  }),
  handle: async params => {
    const data = await api<RawAvmPayload>('/stingray/api/home/details/avm', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    return {
      estimate: mapEstimate(data),
      comparables: (data.comparables ?? []).map(mapComparable),
    };
  },
});
