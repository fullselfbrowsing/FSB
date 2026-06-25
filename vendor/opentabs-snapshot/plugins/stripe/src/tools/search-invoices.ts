import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawInvoice, type StripeList, invoiceSchema, mapInvoice } from './schemas.js';

export const searchInvoices = defineTool({
  name: 'search_invoices',
  displayName: 'Search Invoices',
  description:
    'Search invoices using Stripe search syntax. Example queries: "status:\'open\'", "customer:\'cus_xxx\'", "total>5000".',
  summary: 'Search invoices by query',
  icon: 'search',
  group: 'Invoices',
  input: z.object({
    query: z.string().describe('Search query using Stripe search syntax'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
  }),
  output: z.object({
    invoices: z.array(invoiceSchema).describe('Matching invoices'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawInvoice>>('/invoices/search', {
      query: { query: params.query, limit: params.limit },
    });
    return {
      invoices: (data.data ?? []).map(mapInvoice),
      has_more: data.has_more ?? false,
    };
  },
});
