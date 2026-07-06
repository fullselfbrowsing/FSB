import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';
import { type RawProductSuggestion, mapProductSuggestion, productSuggestionSchema } from './schemas.js';

export const getProductSuggestions = defineTool({
  name: 'get_product_suggestions',
  displayName: 'Get Product Suggestions',
  description:
    'Get available Uber products and services (Ride, Reserve, Courier, Hourly, Rental Cars, Food, Grocery). Returns product names with descriptions and launch URLs.',
  summary: 'Get available Uber products and services',
  icon: 'layout-grid',
  group: 'Products',
  input: z.object({
    type: z
      .enum(['DEFAULT', 'CUSTOM'])
      .optional()
      .describe('Suggestion type — DEFAULT shows all products, CUSTOM shows personalized order. Default DEFAULT.'),
  }),
  output: z.object({
    suggestions: z.array(productSuggestionSchema),
  }),
  handle: async params => {
    const data = await api<{ suggestions?: RawProductSuggestion[] }>('/getProductSuggestions?localeCode=en', {
      body: { type: params.type ?? 'DEFAULT' },
    });
    return {
      suggestions: (data.suggestions ?? []).map(mapProductSuggestion),
    };
  },
});
