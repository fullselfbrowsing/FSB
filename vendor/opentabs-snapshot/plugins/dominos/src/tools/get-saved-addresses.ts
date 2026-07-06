import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { addressSchema, mapAddress } from './schemas.js';

export const getSavedAddresses = defineTool({
  name: 'get_saved_addresses',
  displayName: 'Get Saved Addresses',
  description:
    'List all saved delivery addresses on the customer account. Returns address type, street, city, state, ZIP, and nickname.',
  summary: 'List your saved delivery addresses',
  icon: 'map-pin',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    addresses: z.array(addressSchema).describe('List of saved addresses'),
  }),
  handle: async () => {
    const data = await gql<{
      customer: { addresses: Array<Record<string, unknown>> };
    }>(
      'SavedAddresses',
      `query SavedAddresses {
  customer {
    addresses {
      addressType streetAddress zipCode city state suiteApt nickname businessName
    }
  }
}`,
    );
    return {
      addresses: (data.customer?.addresses ?? []).map(mapAddress),
    };
  },
});
