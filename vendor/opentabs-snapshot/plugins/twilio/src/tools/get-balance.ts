import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { balanceSchema, type RawBalance, mapBalance } from './schemas.js';

export const getBalance = defineTool({
  name: 'get_balance',
  displayName: 'Get Balance',
  description: 'Get the current account balance including currency.',
  summary: 'Get Twilio account balance',
  icon: 'wallet',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    balance: balanceSchema.describe('Account balance details'),
  }),
  handle: async () => {
    const data = await api<RawBalance>('/Balance.json');
    return { balance: mapBalance(data) };
  },
});
