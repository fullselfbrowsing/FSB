import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlQuery } from '../instacart-api.js';
import { type RawAddress, addressSchema, mapAddress } from './schemas.js';

export const listAddresses = defineTool({
  name: 'list_addresses',
  displayName: 'List Addresses',
  description:
    'List all saved delivery addresses on the Instacart account. Returns street address, city, state, postal code, coordinates, and delivery instructions.',
  summary: 'List saved delivery addresses',
  icon: 'map-pin',
  group: 'Account',
  input: z.object({}),
  output: z.object({ addresses: z.array(addressSchema) }),
  handle: async () => {
    const data = await gqlQuery<{ userAddresses: RawAddress[] }>('UserAddresses');
    return { addresses: (data.userAddresses ?? []).map(mapAddress) };
  },
});
