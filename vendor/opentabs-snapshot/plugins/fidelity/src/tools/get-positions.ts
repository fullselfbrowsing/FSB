import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { positionSchema, mapPosition } from './schemas.js';
import type { RawPosition, RawAsset } from './schemas.js';

export const getPositions = defineTool({
  name: 'get_positions',
  displayName: 'Get Positions',
  description:
    'Get holdings/positions for all accounts or specific accounts. Returns symbol, quantity, market value, gain/loss, and holding percentage for each position. Call list_accounts first to discover account numbers.',
  summary: 'View holdings for your accounts',
  icon: 'bar-chart-3',
  group: 'Portfolio',
  input: z.object({
    account_numbers: z
      .array(z.string())
      .optional()
      .describe('Account numbers to get positions for. If omitted, returns positions for all accounts.'),
  }),
  output: z.object({
    positions: z.array(positionSchema).describe('List of positions'),
    total_position_count: z.number().describe('Total number of positions'),
  }),
  handle: async params => {
    interface ContextResponse {
      getContext: {
        person?: {
          assets?: RawAsset[];
          customerAttrDetail?: { externalCustomerID?: string };
        };
      };
    }

    const ctxQuery = `query GetContext {
      getContext {
        person {
          assets { acctNum acctType acctSubType __typename }
          customerAttrDetail { externalCustomerID __typename }
          __typename
        }
        __typename
      }
    }`;

    const ctxData = await portfolioGraphql<ContextResponse>('GetContext', ctxQuery);
    const allAssets = ctxData.getContext?.person?.assets ?? [];
    const customerId = ctxData.getContext?.person?.customerAttrDetail?.externalCustomerID ?? '';

    let filteredAssets = allAssets;
    if (params.account_numbers?.length) {
      filteredAssets = allAssets.filter(a => params.account_numbers?.includes(a.acctNum ?? ''));
    }

    if (filteredAssets.length === 0) {
      return { positions: [], total_position_count: 0 };
    }

    const acctListStr = filteredAssets
      .map(
        a => `{acctNum: "${a.acctNum ?? ''}", acctType: "${a.acctType ?? ''}", acctSubType: "${a.acctSubType ?? ''}"}`,
      )
      .join(', ');

    interface PositionsResponse {
      getPosition: {
        position?: {
          portfolioDetail?: { portfolioPositionCount?: number };
          acctDetails?: {
            acctDetail?: Array<{
              acctNum?: string;
              positionDetails?: {
                positionDetail?: RawPosition[];
              };
            }>;
          };
        };
      };
    }

    const posQuery = `query GetPositions {
      getPosition(acctList: [${acctListStr}], customerId: "${customerId}") {
        position {
          portfolioDetail { portfolioPositionCount __typename }
          acctDetails {
            acctDetail {
              acctNum
              positionDetails {
                positionDetail {
                  symbol cusip holdingPct securityDescription
                  securityType securitySubType quantity
                  hasIntradayPricingInd
                  marketValDetail { marketVal totalGainLoss __typename }
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
        __typename
      }
    }`;

    const posData = await portfolioGraphql<PositionsResponse>('GetPositions', posQuery);

    const positions: Array<ReturnType<typeof mapPosition>> = [];
    const acctDetails = posData.getPosition?.position?.acctDetails?.acctDetail ?? [];

    for (const acct of acctDetails) {
      const acctNum = acct.acctNum ?? '';
      for (const pos of acct.positionDetails?.positionDetail ?? []) {
        positions.push(mapPosition(pos, acctNum));
      }
    }

    return {
      positions,
      total_position_count: posData.getPosition?.position?.portfolioDetail?.portfolioPositionCount ?? positions.length,
    };
  },
});
