import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchInventory } from '../costco-api.js';
import { inventorySchema, mapInventory } from './schemas.js';

export const getProductAvailability = defineTool({
  name: 'get_product_availability',
  displayName: 'Get Product Availability',
  description:
    'Check inventory availability for one or more Costco products. Returns online shipping availability, warehouse availability, pickup availability, and third-party delivery status.',
  summary: 'Check product inventory and availability',
  icon: 'warehouse',
  group: 'Inventory',
  input: z.object({
    item_numbers: z.array(z.string()).describe('Array of item numbers to check (max 30)'),
  }),
  output: z.object({
    items: z.array(inventorySchema),
  }),
  handle: async params => {
    const items = params.item_numbers.slice(0, 30);
    const data = await fetchInventory(items);
    return { items: data.map(mapInventory) };
  },
});
