import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type BelowTheFoldPayload, historyEventSchema, mapHistoryEvent } from './schemas.js';

export const getPropertyHistory = defineTool({
  name: 'get_property_history',
  displayName: 'Get Property History',
  description:
    'Get the price and listing history for a property, including past sales, listings, and price changes from public records and MLS data.',
  summary: 'Get price and listing history',
  icon: 'history',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    events: z.array(historyEventSchema).describe('Historical events sorted by date (newest first)'),
    has_history: z.boolean().describe('Whether property history data is available'),
  }),
  handle: async params => {
    const data = await api<BelowTheFoldPayload>('/stingray/api/home/details/belowTheFold', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    const historyInfo = data.propertyHistoryInfo;
    return {
      events: (historyInfo?.events ?? []).map(mapHistoryEvent),
      has_history: historyInfo?.hasPropertyHistory ?? false,
    };
  },
});
