import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawCustomer, type StripeList, customerSchema, mapCustomer } from './schemas.js';

export const listCustomers = defineTool({
  name: 'list_customers',
  displayName: 'List Customers',
  description:
    'List customers in your Stripe account. Returns customers sorted by creation date (newest first). Use starting_after for cursor-based pagination.',
  summary: 'List customers with pagination',
  icon: 'users',
  group: 'Customers',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of customers to return (default 10, max 100)'),
    starting_after: z.string().optional().describe('Customer ID cursor — fetch customers created after this ID'),
    email: z.string().optional().describe('Filter by exact email address'),
  }),
  output: z.object({
    customers: z.array(customerSchema).describe('List of customers'),
    has_more: z.boolean().describe('Whether more customers exist after this page'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawCustomer>>('/customers', {
      query: {
        limit: params.limit,
        starting_after: params.starting_after,
        email: params.email,
      },
    });
    return {
      customers: (data.data ?? []).map(mapCustomer),
      has_more: data.has_more ?? false,
    };
  },
});
