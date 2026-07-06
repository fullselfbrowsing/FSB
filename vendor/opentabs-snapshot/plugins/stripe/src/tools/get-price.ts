import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawPrice, mapPrice, priceSchema } from './schemas.js';

export const getPrice = defineTool({
  name: 'get_price',
  displayName: 'Get Price',
  description: 'Get detailed information about a specific price by its ID.',
  summary: 'Get a price by ID',
  icon: 'tag',
  group: 'Products',
  input: z.object({
    price_id: z.string().describe('Price ID (e.g., price_xxx)'),
  }),
  output: z.object({ price: priceSchema }),
  handle: async params => {
    const data = await api<RawPrice>(`/prices/${params.price_id}`);
    return { price: mapPrice(data) };
  },
});
