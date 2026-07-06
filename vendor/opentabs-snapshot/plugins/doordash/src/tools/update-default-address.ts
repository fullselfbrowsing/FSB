import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { addressSchema, mapAddress } from './schemas.js';

const MUTATION = `mutation updateConsumerDefaultAddressV2($defaultAddressId: ID!) {
  updateConsumerDefaultAddressV2(defaultAddressId: $defaultAddressId) {
    defaultAddress {
      id addressId street city subpremise state zipCode country countryCode
      lat lng timezone shortname printableAddress driverInstructions
    }
  }
}`;

interface UpdateDefaultAddressResponse {
  updateConsumerDefaultAddressV2: {
    defaultAddress: Record<string, unknown>;
  };
}

export const updateDefaultAddress = defineTool({
  name: 'update_default_address',
  displayName: 'Update Default Address',
  description:
    'Set a saved address as the default delivery address on DoorDash. Use list_addresses to find available address IDs.',
  summary: 'Set your default delivery address',
  icon: 'map-pin',
  group: 'Account',
  input: z.object({
    address_id: z.string().describe('Address record ID to set as default (the "id" field from list_addresses)'),
  }),
  output: z.object({ default_address: addressSchema }),
  handle: async params => {
    const data = await gql<UpdateDefaultAddressResponse>('updateConsumerDefaultAddressV2', MUTATION, {
      defaultAddressId: params.address_id,
    });
    return { default_address: mapAddress(data.updateConsumerDefaultAddressV2.defaultAddress) };
  },
});
