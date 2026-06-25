import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { customerSchema, mapCustomer } from './schemas.js';

export const getCustomer = defineTool({
  name: 'get_customer',
  displayName: 'Get Customer Profile',
  description: 'Get the currently logged-in customer profile including name, email, and phone number.',
  summary: "Get your Domino's account profile",
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ customer: customerSchema.describe('Customer profile') }),
  handle: async () => {
    const data = await gql<{ customer: Record<string, unknown> }>(
      'Customer',
      `query Customer { customer { firstName lastName email phone } }`,
    );
    return { customer: mapCustomer(data.customer) };
  },
});
