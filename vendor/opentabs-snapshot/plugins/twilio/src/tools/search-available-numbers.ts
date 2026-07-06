import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { availableNumberSchema, type RawAvailableNumber, mapAvailableNumber } from './schemas.js';

export const searchAvailableNumbers = defineTool({
  name: 'search_available_numbers',
  displayName: 'Search Available Numbers',
  description:
    'Search for available local phone numbers that can be purchased. Filter by country, area code, or number pattern.',
  summary: 'Search for available phone numbers to buy',
  icon: 'search',
  group: 'Phone Numbers',
  input: z.object({
    country: z.string().length(2).optional().describe('ISO country code (default "US")'),
    area_code: z.string().optional().describe('Area code to search within'),
    contains: z
      .string()
      .optional()
      .describe('Number pattern to search for (e.g., "555" to find numbers containing 555)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of results to return (default 50, max 1000)'),
  }),
  output: z.object({
    available_phone_numbers: z.array(availableNumberSchema).describe('List of available phone numbers'),
  }),
  handle: async params => {
    const country = params.country ?? 'US';
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 50,
    };
    if (params.area_code !== undefined) query.AreaCode = params.area_code;
    if (params.contains !== undefined) query.Contains = params.contains;

    const data = await api<{ available_phone_numbers?: RawAvailableNumber[] }>(
      `/AvailablePhoneNumbers/${country}/Local.json`,
      { query },
    );
    return { available_phone_numbers: (data.available_phone_numbers ?? []).map(mapAvailableNumber) };
  },
});
