import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawInvoice, invoiceSchema, mapInvoice } from './schemas.js';

export const voidInvoice = defineTool({
  name: 'void_invoice',
  displayName: 'Void Invoice',
  description: 'Void an open invoice. The invoice will be marked as void and no payment will be collected.',
  summary: 'Void an open invoice',
  icon: 'file-x',
  group: 'Invoices',
  input: z.object({
    invoice_id: z.string().describe('Invoice ID to void (e.g., in_xxx)'),
  }),
  output: z.object({ invoice: invoiceSchema }),
  handle: async params => {
    const data = await api<RawInvoice>(`/invoices/${params.invoice_id}/void`, { method: 'POST', body: {} });
    return { invoice: mapInvoice(data) };
  },
});
