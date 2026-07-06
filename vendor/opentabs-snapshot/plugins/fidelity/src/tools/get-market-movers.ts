import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { marketMoverSchema, mapMarketMover } from './schemas.js';
import type { RawMarketMover } from './schemas.js';

export const getMarketMovers = defineTool({
  name: 'get_market_movers',
  displayName: 'Get Market Movers',
  description:
    'Get top market movers including most active, top gainers, and top losers. Returns symbol, volume, and percentage change.',
  summary: 'View top market movers',
  icon: 'arrow-up-down',
  group: 'Market Data',
  input: z.object({}),
  output: z.object({
    movers: z.array(marketMoverSchema).describe('List of top market movers'),
  }),
  handle: async () => {
    interface MoversResponse {
      marketmovers: RawMarketMover[];
    }

    const query = `query MarketMovers($symbol: String!) {
      marketmovers(symbol: $symbol) {
        symbol volume pctChg symbolType lastDate lastTime description
        __typename
      }
    }`;

    const data = await portfolioGraphql<MoversResponse>('MarketMovers', query, {
      symbol: '.ttma_re,.ttpl_re,.ttpg_re',
    });

    return {
      movers: (data.marketmovers ?? []).map(m => mapMarketMover(m)),
    };
  },
});
