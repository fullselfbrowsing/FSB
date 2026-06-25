import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawCustomer, customerSchema, mapCustomer } from './schemas.js';

export const updateCustomer = defineTool({
  name: 'update_customer',
  displayName: 'Update Customer',
  description: 'Update an existing customer. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update a customer',
  icon: 'user-pen',
  group: 'Customers',
  input: z.object({
    customer_id: z.string().describe('Customer ID to update (e.g., cus_xxx)'),
    email: z.string().optional().describe('New email address'),
    name: z.string().optional().describe('New name'),
    phone: z.string().optional().describe('New phone number'),
    description: z.string().optional().describe('New description'),
    metadata: z.record(z.string(), z.string()).optional().describe('New metadata (replaces existing)'),
  }),
  output: z.object({ customer: customerSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.email !== undefined) body.email = params.email;
    if (params.name !== undefined) body.name = params.name;
    if (params.phone !== undefined) body.phone = params.phone;
    if (params.description !== undefined) body.description = params.description;
    if (params.metadata !== undefined) body.metadata = params.metadata;
    const data = await api<RawCustomer>(`/customers/${params.customer_id}`, { method: 'POST', body });
    return { customer: mapCustomer(data) };
  },
});
