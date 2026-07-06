import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getReduxSlice } from '../starbucks-api.js';

const earnRateSchema = z.object({
  payment_type: z.string().describe('Payment type (e.g., "VISA", "SVC", "PAY_PAL")'),
  standard_earn_rate: z.number().describe('Stars earned per dollar for standard members'),
  employee_earn_rate: z.number().describe('Stars earned per dollar for Starbucks partners (employees)'),
});

export const getEarnRates = defineTool({
  name: 'get_earn_rates',
  displayName: 'Get Earn Rates',
  description:
    'Get the Stars earn rates by payment type. Shows how many Stars you earn per dollar spent with each payment method (e.g., Starbucks Card earns 2x, credit cards earn 1x).',
  summary: 'Get Stars earn rates by payment type',
  icon: 'trending-up',
  group: 'Rewards',
  input: z.object({}),
  output: z.object({
    earn_rates: z.array(earnRateSchema).describe('Earn rates by payment type'),
  }),
  handle: async () => {
    interface RateData {
      standardEarnRate?: number;
      employeeEarnRate?: number;
    }
    const data = getReduxSlice<Record<string, RateData>>('accrualEarnRates.data');
    if (!data) return { earn_rates: [] };

    return {
      earn_rates: Object.entries(data).map(([key, value]) => ({
        payment_type: key,
        standard_earn_rate: value.standardEarnRate ?? 0,
        employee_earn_rate: value.employeeEarnRate ?? 0,
      })),
    };
  },
});
