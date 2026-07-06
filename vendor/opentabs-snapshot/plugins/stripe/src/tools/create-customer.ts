import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawCustomer, customerSchema, mapCustomer } from './schemas.js';

export const createCustomer = defineTool({
  name: 'create_customer',
  displayName: 'Create Customer',
  description: 'Create a new customer in your Stripe account.',
  summary: 'Create a new customer',
  icon: 'user-plus',
  group: 'Customers',
  input: z.object({
    email: z.string().optional().describe('Customer email address'),
    name: z.string().optional().describe('Customer full name'),
    phone: z.string().optional().describe('Customer phone number'),
    description: z.string().optional().describe('Description of the customer'),
    metadata: z.record(z.string(), z.string()).optional().describe('Arbitrary key-value metadata'),
  }),
  output: z.object({ customer: customerSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.email !== undefined) body.email = params.email;
    if (params.name !== undefined) body.name = params.name;
    if (params.phone !== undefined) body.phone = params.phone;
    if (params.description !== undefined) body.description = params.description;
    if (params.metadata !== undefined) body.metadata = params.metadata;
    const data = await api<RawCustomer>('/customers', { method: 'POST', body });
    return { customer: mapCustomer(data) };
  },
});
