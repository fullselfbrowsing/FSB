import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import {
  type RawAsset,
  type RawLatestPrice,
  assetSchema,
  latestPriceSchema,
  mapAsset,
  mapLatestPrice,
} from './schemas.js';

const QUERY = `query GetAssetBySymbol($symbol: String!, $quoteCurrency: TickerSymbol!) {
  assetBySymbol(symbol: $symbol) {
    uuid name symbol slug description color imageUrl
    circulatingSupply maxSupply marketCap volume24h allTimeHigh unitPriceScale
    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }
  }
}`;

interface Response {
  assetBySymbol: RawAsset & { latestPrice?: RawLatestPrice };
}

export const getAssetBySymbol = defineTool({
  name: 'get_asset_by_symbol',
  displayName: 'Get Asset by Symbol',
  description:
    'Get detailed information about a cryptocurrency asset by its ticker symbol (e.g. "BTC", "ETH", "SOL"). Returns market data and current price.',
  summary: 'Get asset details by ticker symbol',
  icon: 'circle-dollar-sign',
  group: 'Assets',
  input: z.object({
    symbol: z.string().describe('Ticker symbol (e.g. "BTC", "ETH", "SOL", "DOGE")'),
    quote_currency: z.string().optional().describe('Quote currency for price (default "USD")'),
  }),
  output: z.object({
    asset: assetSchema,
    latest_price: latestPriceSchema,
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, {
      symbol: params.symbol,
      quoteCurrency: params.quote_currency ?? 'USD',
    });
    const a = data.assetBySymbol;
    return {
      asset: mapAsset(a),
      latest_price: mapLatestPrice(a.latestPrice ?? {}),
    };
  },
});
