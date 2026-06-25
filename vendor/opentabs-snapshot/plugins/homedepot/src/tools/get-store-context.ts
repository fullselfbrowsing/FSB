import { defineTool, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface ExperienceContext {
  store?: { storeId?: string; storeName?: string; storeZip?: string };
  deliveryZip?: string;
}

export const getStoreContext = defineTool({
  name: 'get_store_context',
  displayName: 'Store Context',
  description:
    "Get the user's currently selected Home Depot store and delivery information from the page context. Includes store ID, store name, delivery ZIP, and store ZIP.",
  summary: 'Get current store and delivery info',
  icon: 'store',
  group: 'Stores',
  input: z.object({}),
  output: z.object({
    store_id: z.string().describe('Currently selected store ID'),
    store_name: z.string().describe('Currently selected store name'),
    delivery_zip: z.string().describe('Delivery ZIP code'),
    store_zip: z.string().describe('Store ZIP code'),
  }),
  handle: async () => {
    const ctx = getPageGlobal('__EXPERIENCE_CONTEXT__') as ExperienceContext | undefined;

    return {
      store_id: ctx?.store?.storeId ?? '',
      store_name: ctx?.store?.storeName ?? '',
      delivery_zip: ctx?.deliveryZip ?? '',
      store_zip: ctx?.store?.storeZip ?? '',
    };
  },
});
