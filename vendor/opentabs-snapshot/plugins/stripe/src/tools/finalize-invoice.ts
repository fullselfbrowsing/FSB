import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawInvoice, invoiceSchema, mapInvoice } from './schemas.js';

export const finalizeInvoice = defineTool({
  name: 'finalize_invoice',
  displayName: 'Finalize Invoice',
  description:
    'Finalize a draft invoice, transitioning it to open status. After finalization, the invoice can be sent to the customer or paid automatically.',
  summary: 'Finalize a draft invoice',
  icon: 'file-check',
  group: 'Invoices',
  input: z.object({
    invoice_id: z.string().describe('Invoice ID to finalize (e.g., in_xxx)'),
  }),
  output: z.object({ invoice: invoiceSchema }),
  handle: async params => {
    const data = await api<RawInvoice>(`/invoices/${params.invoice_id}/finalize`, { method: 'POST', body: {} });
    return { invoice: mapInvoice(data) };
  },
});
