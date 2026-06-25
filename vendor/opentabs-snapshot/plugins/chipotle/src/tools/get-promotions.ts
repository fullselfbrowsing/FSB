import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawPromotion, mapPromotion, promotionSchema } from './schemas.js';

export const getPromotions = defineTool({
  name: 'get_promotions',
  displayName: 'Get Promotions',
  description:
    'Get available promotions and coupon codes for the authenticated Chipotle customer. Optionally filter by country code.',
  summary: 'Get available promotions and coupon codes',
  icon: 'tag',
  group: 'Account',
  input: z.object({
    country_code: z.string().optional().describe('Country code filter (default "US")'),
  }),
  output: z.object({
    promotions: z.array(promotionSchema).describe('Available promotions'),
  }),
  handle: async params => {
    const data = await api<RawPromotion[]>('/promo/v2/customers/promotions', {
      query: { countryCode: params.country_code ?? 'US' },
    });
    return { promotions: (data ?? []).map(mapPromotion) };
  },
});
