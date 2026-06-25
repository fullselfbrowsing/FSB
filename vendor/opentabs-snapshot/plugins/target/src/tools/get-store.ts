import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { redskyApi } from '../target-api.js';
import { storeSchema, mapStore } from './schemas.js';
import type { RawStore } from './schemas.js';

interface StoreResponse {
  data?: { store?: RawStore };
}

export const getStore = defineTool({
  name: 'get_store',
  displayName: 'Get Store',
  description:
    'Get detailed information about a specific Target store by its store ID. Returns name, address, phone, and status.',
  summary: 'Get details for a Target store',
  icon: 'store',
  group: 'Stores',
  input: z.object({
    store_id: z.string().describe('Store ID (e.g., "1426")'),
  }),
  output: z.object({ store: storeSchema }),
  handle: async params => {
    const data = await redskyApi<StoreResponse>('redsky_aggregations/v1/web/store_location_v1', {
      store_id: params.store_id,
    });
    const store = data.data?.store ?? {};
    return { store: mapStore(store as RawStore) };
  },
});
