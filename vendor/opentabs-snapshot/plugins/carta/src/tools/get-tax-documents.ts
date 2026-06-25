import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface TaxDocumentsResponse {
  tax_documents: Array<Record<string, unknown>>;
}

const taxDocSchema = z.object({
  documents: z.array(z.record(z.string(), z.unknown())),
});

export const getTaxDocuments = defineTool({
  name: 'get_tax_documents',
  displayName: 'Get Tax Documents',
  description:
    'Get tax documents (1099s, K-1s, etc.) available for the portfolio. Returns document metadata and download information.',
  summary: 'Get tax documents',
  icon: 'file-spreadsheet',
  group: 'Documents',
  input: z.object({}),
  output: z.object({ result: taxDocSchema }),
  handle: async () => {
    const ctx = requireContext();
    const data = await api<TaxDocumentsResponse>(`/api/profiles/tax-form/${ctx.portfolioId}/tax-documents/`);
    return {
      result: {
        documents: data.tax_documents,
      },
    };
  },
});
