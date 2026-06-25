import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';

export const getPortfolioSummary = defineTool({
  name: 'get_portfolio_summary',
  displayName: 'Get Portfolio Summary',
  description:
    "Get the total portfolio balance, today's gain/loss, and high-level account status. Returns aggregate balances across all Fidelity accounts including brokerage, retirement, and workplace plans.",
  summary: 'View total portfolio balance and daily gain/loss',
  icon: 'wallet',
  group: 'Portfolio',
  input: z.object({}),
  output: z.object({
    total_market_value: z.number().describe('Total market value across all accounts in USD'),
    todays_gain_loss: z.number().describe("Today's gain/loss in USD"),
    todays_gain_loss_pct: z.number().describe("Today's gain/loss percentage"),
    fidelity_total_market_value: z.number().describe('Total Fidelity-managed market value in USD'),
    has_unpriced_positions: z.boolean().describe('Whether any positions lack current pricing'),
    has_intraday_pricing: z.boolean().describe('Whether intraday pricing is available'),
    account_status: z
      .object({
        brokerage: z.boolean().describe('Has brokerage accounts'),
        retirement: z.boolean().describe('Has retirement accounts'),
        workplace: z.boolean().describe('Has workplace plan accounts'),
        external_linked: z.boolean().describe('Has external linked accounts'),
      })
      .describe('Account type availability'),
  }),
  handle: async () => {
    interface ContextResponse {
      getContext: {
        sysStatus?: {
          balance?: string;
          account?: Record<string, boolean>;
        };
        person?: {
          balances?: {
            hasIntradayPricing?: boolean;
            balanceDetail?: {
              gainLossBalanceDetail?: {
                totalMarketVal?: number;
                todaysGainLoss?: number;
                todaysGainLossPct?: number;
                fidelityTotalMktVal?: number;
                hasUnpricedPositions?: boolean;
              };
            };
          };
        };
      };
    }

    const query = `query GetContext {
      getContext {
        sysStatus {
          balance
          account {
            Brokerage
            StockPlans
            ExternalLinked
            WorkplaceContributions
            WorkplaceBenefits
            __typename
          }
          __typename
        }
        person {
          balances {
            hasIntradayPricing
            balanceDetail {
              gainLossBalanceDetail {
                totalMarketVal
                todaysGainLoss
                todaysGainLossPct
                fidelityTotalMktVal
                hasUnpricedPositions
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`;

    const data = await portfolioGraphql<ContextResponse>('GetContext', query);
    const bal = data.getContext?.person?.balances?.balanceDetail?.gainLossBalanceDetail;
    const acct = data.getContext?.sysStatus?.account;

    return {
      total_market_value: bal?.totalMarketVal ?? 0,
      todays_gain_loss: bal?.todaysGainLoss ?? 0,
      todays_gain_loss_pct: bal?.todaysGainLossPct ?? 0,
      fidelity_total_market_value: bal?.fidelityTotalMktVal ?? 0,
      has_unpriced_positions: bal?.hasUnpricedPositions ?? false,
      has_intraday_pricing: data.getContext?.person?.balances?.hasIntradayPricing ?? false,
      account_status: {
        brokerage: acct?.Brokerage ?? false,
        retirement: false,
        workplace: acct?.WorkplaceContributions ?? acct?.WorkplaceBenefits ?? false,
        external_linked: acct?.ExternalLinked ?? false,
      },
    };
  },
});
