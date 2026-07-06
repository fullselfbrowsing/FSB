import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawCustomer, type StripeList, customerSchema, mapCustomer } from './schemas.js';

export const searchCustomers = defineTool({
  name: 'search_customers',
  displayName: 'Search Customers',
  description:
    "Search customers using Stripe search syntax. Example queries: \"email:'test@example.com'\", \"name:'John'\", \"metadata['key']:'value'\".",
  summary: 'Search customers by query',
  icon: 'search',
  group: 'Customers',
  input: z.object({
    query: z.string().describe('Search query using Stripe search syntax'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 10, max 100)'),
  }),
  output: z.object({
    customers: z.array(customerSchema).describe('Matching customers'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawCustomer>>('/customers/search', {
      query: { query: params.query, limit: params.limit },
    });
    return {
      customers: (data.data ?? []).map(mapCustomer),
      has_more: data.has_more ?? false,
    };
  },
});
