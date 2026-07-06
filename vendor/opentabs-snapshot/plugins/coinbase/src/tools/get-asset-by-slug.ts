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

const QUERY = `query GetAssetBySlug($slug: String!, $quoteCurrency: TickerSymbol!) {
  assetBySlug(slug: $slug) {
    uuid name symbol slug description color imageUrl
    circulatingSupply maxSupply marketCap volume24h allTimeHigh unitPriceScale
    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }
  }
}`;

interface Response {
  assetBySlug: RawAsset & { latestPrice?: RawLatestPrice };
}

export const getAssetBySlug = defineTool({
  name: 'get_asset_by_slug',
  displayName: 'Get Asset by Slug',
  description:
    'Get detailed information about a cryptocurrency asset by its URL slug (e.g. "bitcoin", "ethereum", "solana"). Returns market data and current price.',
  summary: 'Get asset details by URL slug',
  icon: 'circle-dollar-sign',
  group: 'Assets',
  input: z.object({
    slug: z.string().describe('Asset URL slug (e.g. "bitcoin", "ethereum", "solana", "dogecoin")'),
    quote_currency: z.string().optional().describe('Quote currency for price (default "USD")'),
  }),
  output: z.object({
    asset: assetSchema,
    latest_price: latestPriceSchema,
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, {
      slug: params.slug,
      quoteCurrency: params.quote_currency ?? 'USD',
    });
    const a = data.assetBySlug;
    return {
      asset: mapAsset(a),
      latest_price: mapLatestPrice(a.latestPrice ?? {}),
    };
  },
});
