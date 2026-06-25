import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';
import type { RawInvoice } from './schemas.js';
import { invoiceSchema, mapInvoice } from './schemas.js';

export const listInvoices = defineTool({
  name: 'list_invoices',
  displayName: 'List Invoices',
  description: 'List all invoices for the organization. Returns invoice period, amounts due and paid.',
  summary: 'List organization invoices',
  icon: 'receipt',
  group: 'Billing',
  input: z.object({}),
  output: z.object({ invoices: z.array(invoiceSchema).describe('List of invoices') }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<{ invoicesList?: RawInvoice[] }>('ListInvoices', p.ListInvoicesResponse);
    return { invoices: (data.invoicesList ?? []).map(mapInvoice) };
  },
});
