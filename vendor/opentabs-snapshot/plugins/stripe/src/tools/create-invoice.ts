import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawInvoice, invoiceSchema, mapInvoice } from './schemas.js';

export const createInvoice = defineTool({
  name: 'create_invoice',
  displayName: 'Create Invoice',
  description: 'Create a new draft invoice for a customer. After creation, add invoice items and then finalize it.',
  summary: 'Create a draft invoice',
  icon: 'file-plus',
  group: 'Invoices',
  input: z.object({
    customer: z.string().describe('Customer ID to invoice'),
    description: z.string().optional().describe('Invoice description'),
    collection_method: z
      .enum(['charge_automatically', 'send_invoice'])
      .optional()
      .describe('How to collect payment (default charge_automatically)'),
    days_until_due: z
      .number()
      .int()
      .optional()
      .describe('Number of days until invoice is due (for send_invoice collection)'),
    metadata: z.record(z.string(), z.string()).optional().describe('Arbitrary key-value metadata'),
  }),
  output: z.object({ invoice: invoiceSchema }),
  handle: async params => {
    const body: Record<string, unknown> = { customer: params.customer };
    if (params.description !== undefined) body.description = params.description;
    if (params.collection_method !== undefined) body.collection_method = params.collection_method;
    if (params.days_until_due !== undefined) body.days_until_due = params.days_until_due;
    if (params.metadata !== undefined) body.metadata = params.metadata;
    const data = await api<RawInvoice>('/invoices', { method: 'POST', body });
    return { invoice: mapInvoice(data) };
  },
});
