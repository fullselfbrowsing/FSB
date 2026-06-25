import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawCustomer, customerSchema, mapCustomer } from './schemas.js';

export const getCustomer = defineTool({
  name: 'get_customer',
  displayName: 'Get Customer',
  description: 'Get detailed information about a specific customer by their ID.',
  summary: 'Get a customer by ID',
  icon: 'user',
  group: 'Customers',
  input: z.object({
    customer_id: z.string().describe('Customer ID (e.g., cus_xxx)'),
  }),
  output: z.object({ customer: customerSchema }),
  handle: async params => {
    const data = await api<RawCustomer>(`/customers/${params.customer_id}`);
    return { customer: mapCustomer(data) };
  },
});
