import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawInvoice, invoiceSchema, mapInvoice } from './schemas.js';

export const getInvoice = defineTool({
  name: 'get_invoice',
  displayName: 'Get Invoice',
  description: 'Get detailed information about a specific invoice by its ID.',
  summary: 'Get an invoice by ID',
  icon: 'file-text',
  group: 'Invoices',
  input: z.object({
    invoice_id: z.string().describe('Invoice ID (e.g., in_xxx)'),
  }),
  output: z.object({ invoice: invoiceSchema }),
  handle: async params => {
    const data = await api<RawInvoice>(`/invoices/${params.invoice_id}`);
    return { invoice: mapInvoice(data) };
  },
});
