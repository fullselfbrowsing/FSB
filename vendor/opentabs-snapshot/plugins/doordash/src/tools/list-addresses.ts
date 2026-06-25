import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { addressSchema, mapAddress } from './schemas.js';

const QUERY = `query getAvailableAddresses {
  getAvailableAddresses {
    id addressId street city subpremise state zipCode country countryCode
    lat lng districtId manualLat manualLng timezone shortname printableAddress
    driverInstructions
  }
}`;

interface AddressesResponse {
  getAvailableAddresses: Array<Record<string, unknown>>;
}

export const listAddresses = defineTool({
  name: 'list_addresses',
  displayName: 'List Addresses',
  description:
    'List all saved delivery addresses on the DoorDash account. Returns street, city, state, ZIP, coordinates, and delivery instructions for each address.',
  summary: 'List your saved delivery addresses',
  icon: 'map-pin',
  group: 'Account',
  input: z.object({}),
  output: z.object({ addresses: z.array(addressSchema).describe('Saved delivery addresses') }),
  handle: async () => {
    const data = await gql<AddressesResponse>('getAvailableAddresses', QUERY);
    return { addresses: (data.getAvailableAddresses ?? []).map(mapAddress) };
  },
});
