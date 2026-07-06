import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawUsageRecord, mapUsageRecord, usageRecordSchema } from './schemas.js';

export const listUsageRecords = defineTool({
  name: 'list_usage_records',
  displayName: 'List Usage Records',
  description: 'List account usage records. Optionally filter by category (e.g., sms, calls) and date range.',
  summary: 'List Usage Records',
  icon: 'bar-chart-3',
  group: 'Usage',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of records to return per page (default 20, max 1000)'),
    category: z.string().optional().describe('Filter by usage category (e.g., sms, calls, phonenumbers)'),
    start_date: z.string().optional().describe('Filter usage starting from this date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('Filter usage up to this date (YYYY-MM-DD)'),
  }),
  output: z.object({
    usage_records: z.array(usageRecordSchema).describe('Array of usage records'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };
    if (params.category) query.Category = params.category;
    if (params.start_date) query.StartDate = params.start_date;
    if (params.end_date) query.EndDate = params.end_date;

    const data = await api<{ usage_records: RawUsageRecord[] }>('/Usage/Records.json', { query });
    return { usage_records: (data.usage_records ?? []).map(mapUsageRecord) };
  },
});
