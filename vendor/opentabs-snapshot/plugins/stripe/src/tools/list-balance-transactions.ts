import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import {
  type RawBalanceTransaction,
  type StripeList,
  balanceTransactionSchema,
  mapBalanceTransaction,
} from './schemas.js';

export const listBalanceTransactions = defineTool({
  name: 'list_balance_transactions',
  displayName: 'List Balance Transactions',
  description:
    'List balance transactions (charges, refunds, payouts, etc.) showing how funds flow through your account.',
  summary: 'List balance transactions',
  icon: 'arrow-left-right',
  group: 'Balance',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
    starting_after: z.string().optional().describe('Balance transaction ID cursor for pagination'),
    type: z.string().optional().describe('Filter by transaction type (e.g., charge, refund, payout, transfer)'),
  }),
  output: z.object({
    transactions: z.array(balanceTransactionSchema).describe('List of balance transactions'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawBalanceTransaction>>('/balance_transactions', {
      query: { limit: params.limit, starting_after: params.starting_after, type: params.type },
    });
    return {
      transactions: (data.data ?? []).map(mapBalanceTransaction),
      has_more: data.has_more ?? false,
    };
  },
});
