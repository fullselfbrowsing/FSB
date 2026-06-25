import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { balancePointSchema } from './schemas.js';
import type { RawAsset } from './schemas.js';

export const getBalanceHistory = defineTool({
  name: 'get_balance_history',
  displayName: 'Get Balance History',
  description:
    'Get historical portfolio balance data over a specified time range. Returns daily balance values and the total gain/loss for the period. Use for portfolio performance charting.',
  summary: 'View portfolio balance over time',
  icon: 'trending-up',
  group: 'Portfolio',
  input: z.object({
    range: z
      .enum(['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'])
      .optional()
      .describe('Time range for balance history (default: 1Y)'),
  }),
  output: z.object({
    range_gain_loss: z.number().describe('Total gain/loss for the requested period in USD'),
    range_gain_loss_pct: z.number().describe('Percentage gain/loss for the period'),
    balances: z.array(balancePointSchema).describe('Daily balance data points'),
  }),
  handle: async params => {
    interface ContextResponse {
      getContext: {
        person?: { assets?: RawAsset[] };
      };
    }

    const ctxQuery = `query GetContext {
      getContext {
        person {
          assets { acctNum acctType __typename }
          __typename
        }
        __typename
      }
    }`;

    const ctxData = await portfolioGraphql<ContextResponse>('GetContext', ctxQuery);
    const assets = (ctxData.getContext?.person?.assets ?? []).filter(a => !!a.acctNum);

    const acctListStr = assets.map(a => `{acctNum: "${a.acctNum ?? ''}", acctType: "${a.acctType ?? ''}"}`).join(', ');

    const range = params.range ?? '1Y';

    interface BalanceHistoryResponse {
      balanceHistory: {
        balHistoryDetail?: {
          requestedDateRangeGainLoss?: number;
          requestedDateRangeGainLossPct?: number;
          balances?: Array<{ date?: string; value?: number }>;
        };
      };
    }

    const query = `query BalanceHistory {
      balanceHistory(range: "${range}", acctList: [${acctListStr}]) {
        balHistoryDetail {
          requestedDateRangeGainLoss
          requestedDateRangeGainLossPct
          balances { date value __typename }
          __typename
        }
        __typename
      }
    }`;

    const data = await portfolioGraphql<BalanceHistoryResponse>('BalanceHistory', query);

    const detail = data.balanceHistory?.balHistoryDetail;

    return {
      range_gain_loss: detail?.requestedDateRangeGainLoss ?? 0,
      range_gain_loss_pct: detail?.requestedDateRangeGainLossPct ?? 0,
      balances: (detail?.balances ?? []).map(b => ({
        date: b.date ?? '',
        value: b.value ?? 0,
      })),
    };
  },
});
