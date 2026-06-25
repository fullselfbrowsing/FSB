import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';
import { type RawEnabledProducts, enabledProductSchema, mapEnabledProducts } from './schemas.js';

export const getEnabledProducts = defineTool({
  name: 'get_enabled_products',
  displayName: 'Get Enabled Products',
  description:
    "Get the Uber products enabled in the user's region (e.g., Ride, Connect/Courier, Rent). Useful for understanding what services are available.",
  summary: 'Get Uber products available in the region',
  icon: 'car',
  group: 'Products',
  input: z.object({}),
  output: z.object({
    products: z.array(enabledProductSchema),
  }),
  handle: async () => {
    const data = await api<RawEnabledProducts>('/getMapHeroEnabledProducts?localeCode=en');
    return { products: mapEnabledProducts(data) };
  },
});
