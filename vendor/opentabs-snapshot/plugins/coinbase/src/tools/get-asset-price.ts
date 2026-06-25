import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawLatestPrice, latestPriceSchema, mapLatestPrice } from './schemas.js';

const QUERY = `query GetAssetPrice($uuid: Uuid!, $quoteCurrency: TickerSymbol!) {
  assetByUuid(uuid: $uuid) {
    name symbol
    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }
  }
}`;

interface Response {
  assetByUuid: {
    name?: string;
    symbol?: string;
    latestPrice?: RawLatestPrice;
  };
}

export const getAssetPrice = defineTool({
  name: 'get_asset_price',
  displayName: 'Get Asset Price',
  description:
    'Get the current price of a cryptocurrency asset by UUID. Returns the latest price, timestamp, and quote currency. Use get_asset_by_symbol or get_asset_by_slug first to find the UUID if needed.',
  summary: 'Get current price for an asset',
  icon: 'trending-up',
  group: 'Prices',
  input: z.object({
    uuid: z.string().describe('Asset UUID'),
    quote_currency: z.string().optional().describe('Quote currency for price (default "USD")'),
  }),
  output: z.object({
    name: z.string().describe('Asset name'),
    symbol: z.string().describe('Ticker symbol'),
    latest_price: latestPriceSchema,
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, {
      uuid: params.uuid,
      quoteCurrency: params.quote_currency ?? 'USD',
    });
    const a = data.assetByUuid;
    return {
      name: a.name ?? '',
      symbol: a.symbol ?? '',
      latest_price: mapLatestPrice(a.latestPrice ?? {}),
    };
  },
});
