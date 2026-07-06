import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { accountSchema, mapAccount } from './schemas.js';
import type { RawAsset } from './schemas.js';

export const listAccounts = defineTool({
  name: 'list_accounts',
  displayName: 'List Accounts',
  description:
    'List all Fidelity accounts with balances, types, and gain/loss. Includes brokerage, retirement, workplace, and external linked accounts. Hidden accounts are included with is_hidden=true.',
  summary: 'List all accounts with balances',
  icon: 'list',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    accounts: z.array(accountSchema).describe('List of accounts'),
  }),
  handle: async () => {
    interface ContextResponse {
      getContext: {
        person?: {
          assets?: RawAsset[];
        };
      };
    }

    const query = `query GetContext {
      getContext {
        person {
          assets {
            acctNum
            acctType
            acctSubType
            acctSubTypeDesc
            acctCreationDate
            preferenceDetail { name isHidden isDefaultAcct __typename }
            gainLossBalanceDetail {
              totalMarketVal todaysGainLoss todaysGainLossPct
              asOfDateTime hasUnpricedPositions hasIntradayPricing
              __typename
            }
            acctTypesIndDetail { isRetirement isYouthAcct __typename }
            acctTradeAttrDetail { isTradable __typename }
            acctAttrDetail { regTypeDesc __typename }
            workplacePlanDetail { planName planTypeName __typename }
            __typename
          }
          __typename
        }
        __typename
      }
    }`;

    const data = await portfolioGraphql<ContextResponse>('GetContext', query);
    const assets = data.getContext?.person?.assets ?? [];

    return {
      accounts: assets.map(a => mapAccount(a)),
    };
  },
});
