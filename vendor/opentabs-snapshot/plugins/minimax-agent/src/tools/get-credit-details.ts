import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { creditRecordSchema, mapCreditRecord } from './schemas.js';
import type { RawCreditRecord } from './schemas.js';

export const getCreditDetails = defineTool({
  name: 'get_credit_details',
  displayName: 'Get Credit Details',
  description:
    'List credit transaction records for the authenticated MiniMax Agent account. Shows credit earnings and spending history with pagination support.',
  summary: 'List credit transaction history',
  icon: 'list',
  group: 'Account',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    per_page: z.number().int().min(1).max(50).optional().describe('Records per page (default 20, max 50)'),
  }),
  output: z.object({
    records: z.array(creditRecordSchema).describe('Credit transaction records'),
    has_more: z.boolean().describe('Whether more records are available'),
  }),
  handle: async params => {
    const data = await apiPost<{ records?: RawCreditRecord[]; has_more?: boolean }>(
      '/matrix/api/v1/commerce/list_credit_record',
      { page_num: params.page ?? 1, page_size: params.per_page ?? 20 },
    );
    return {
      records: (data.records ?? []).map(mapCreditRecord),
      has_more: data.has_more ?? false,
    };
  },
});
