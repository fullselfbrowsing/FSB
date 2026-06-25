import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../target-api.js';
import { savingsSummarySchema, mapSavingsSummary } from './schemas.js';
import type { RawSavingsSummary } from './schemas.js';

export const getSavingsSummary = defineTool({
  name: 'get_savings_summary',
  displayName: 'Get Savings Summary',
  description:
    'Get a savings breakdown showing RedCard savings, Target Circle offer savings, promotional savings, and totals. Covers the configured date range (typically the current year).',
  summary: 'Get Target savings breakdown by category',
  icon: 'piggy-bank',
  group: 'Account',
  input: z.object({}),
  output: z.object({ savings: savingsSummarySchema }),
  handle: async () => {
    const data = await api<RawSavingsSummary>('guest_savings_summaries/v1');
    return { savings: mapSavingsSummary(data) };
  },
});
