import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawInvoice, type StripeList, invoiceSchema, mapInvoice } from './schemas.js';

export const listInvoices = defineTool({
  name: 'list_invoices',
  displayName: 'List Invoices',
  description: 'List invoices in your Stripe account. Returns invoices sorted by creation date (newest first).',
  summary: 'List invoices with pagination',
  icon: 'file-text',
  group: 'Invoices',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
    starting_after: z.string().optional().describe('Invoice ID cursor for pagination'),
    customer: z.string().optional().describe('Filter by customer ID'),
    status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional().describe('Filter by invoice status'),
  }),
  output: z.object({
    invoices: z.array(invoiceSchema).describe('List of invoices'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawInvoice>>('/invoices', {
      query: {
        limit: params.limit,
        starting_after: params.starting_after,
        customer: params.customer,
        status: params.status,
      },
    });
    return {
      invoices: (data.data ?? []).map(mapInvoice),
      has_more: data.has_more ?? false,
    };
  },
});
