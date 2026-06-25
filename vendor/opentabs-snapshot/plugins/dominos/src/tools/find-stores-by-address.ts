import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { storeSchema, mapStore, customerLocationSchema, mapCustomerLocation } from './schemas.js';

export const findStoresByAddress = defineTool({
  name: 'find_stores_by_address',
  displayName: 'Find Stores by Address',
  description:
    "Find nearby Domino's stores using a Google Place ID. Get a place_id by calling search_address first. Optionally filter by service method (DELIVERY or CARRYOUT).",
  summary: 'Find stores near a specific address',
  icon: 'store',
  group: 'Stores',
  input: z.object({
    place_id: z.string().describe('Google Place ID from search_address results'),
    service_method: z.enum(['DELIVERY', 'CARRYOUT']).optional().describe('Filter by service method'),
  }),
  output: z.object({
    stores: z.array(storeSchema).describe('List of nearby stores'),
    customer_location: customerLocationSchema.describe('Resolved customer location from the place ID'),
  }),
  handle: async params => {
    const data = await gql<{
      storesByPlaceId: {
        stores: Array<Record<string, unknown>>;
        customerLocation: Record<string, unknown>;
      };
    }>(
      'StoresByPlaceId',
      `query StoresByPlaceId($placeId: String, $serviceMethod: ServiceMethod) {
  storesByPlaceId(placeId: $placeId, serviceMethod: $serviceMethod) {
    customerLocation { streetAddress zipCode city state }
    stores {
      id storeName etaMinutes latitude longitude estimatedWaitMinutes
      address postalCode region street city distance isOpen openLabel
      allowCarsideDelivery allowDeliveryOrders phone
    }
  }
}`,
      {
        placeId: params.place_id,
        serviceMethod: params.service_method,
      },
    );
    return {
      stores: (data.storesByPlaceId?.stores ?? []).map(mapStore),
      customer_location: mapCustomerLocation(data.storesByPlaceId?.customerLocation ?? {}),
    };
  },
});
