import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { addressSuggestionSchema, mapSuggestion } from './schemas.js';

export const searchAddress = defineTool({
  name: 'search_address',
  displayName: 'Search Address',
  description:
    'Autocomplete an address string to get place IDs. Use the returned place_id with find_stores_by_address to locate nearby stores. The service_method determines whether to search for delivery or carryout stores.',
  summary: 'Autocomplete an address for store search',
  icon: 'search',
  group: 'Stores',
  input: z.object({
    address: z.string().describe('Address text to autocomplete'),
    service_method: z.enum(['DELIVERY', 'CARRYOUT']).describe('Service method: DELIVERY or CARRYOUT'),
  }),
  output: z.object({
    suggestions: z.array(addressSuggestionSchema).describe('Address suggestions with place IDs'),
  }),
  handle: async params => {
    const data = await gql<{
      getPlaceIdByAddress: {
        suggestions: Array<Record<string, unknown>>;
      } | null;
    }>(
      'PlaceIdByAddress',
      `query PlaceIdByAddress($address: String!, $serviceMethod: ServiceMethod!) {
  getPlaceIdByAddress(address: $address, serviceMethod: $serviceMethod) {
    suggestions { placeId mainText secondaryText }
  }
}`,
      {
        address: params.address,
        serviceMethod: params.service_method,
      },
    );
    return {
      suggestions: (data.getPlaceIdByAddress?.suggestions ?? []).map(mapSuggestion),
    };
  },
});
