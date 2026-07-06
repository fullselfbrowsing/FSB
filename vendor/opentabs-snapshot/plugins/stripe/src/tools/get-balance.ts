import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawBalance, balanceSchema, mapBalance } from './schemas.js';

export const getBalance = defineTool({
  name: 'get_balance',
  displayName: 'Get Balance',
  description:
    'Get the current balance of your Stripe account, broken down by currency. Shows available and pending balances.',
  summary: 'Get account balance',
  icon: 'wallet',
  group: 'Balance',
  input: z.object({}),
  output: z.object({ balance: balanceSchema }),
  handle: async () => {
    const data = await api<RawBalance>('/balance');
    return { balance: mapBalance(data) };
  },
});
