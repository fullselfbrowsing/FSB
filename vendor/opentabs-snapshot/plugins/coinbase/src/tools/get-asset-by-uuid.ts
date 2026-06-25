import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import {
  type RawAsset,
  type RawAssetCategory,
  type RawAssetNetwork,
  type RawLatestPrice,
  assetCategorySchema,
  assetNetworkSchema,
  assetSchema,
  latestPriceSchema,
  mapAsset,
  mapAssetCategory,
  mapAssetNetwork,
  mapLatestPrice,
} from './schemas.js';

const QUERY = `query GetAssetByUuid($uuid: Uuid!, $quoteCurrency: TickerSymbol!) {
  assetByUuid(uuid: $uuid) {
    uuid name symbol slug description color imageUrl
    circulatingSupply maxSupply marketCap volume24h allTimeHigh unitPriceScale
    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }
    categories { uuid name slug description }
    networks { displayName chainId contractAddress }
  }
}`;

interface Response {
  assetByUuid: RawAsset & {
    latestPrice?: RawLatestPrice;
    categories?: RawAssetCategory[];
    networks?: RawAssetNetwork[];
  };
}

export const getAssetByUuid = defineTool({
  name: 'get_asset_by_uuid',
  displayName: 'Get Asset by UUID',
  description:
    'Get detailed information about a cryptocurrency asset by its Coinbase UUID. Returns market data, price, categories, and supported networks.',
  summary: 'Get asset details by UUID',
  icon: 'circle-dollar-sign',
  group: 'Assets',
  input: z.object({
    uuid: z.string().describe('Asset UUID (e.g. "5b71fc48-3dd3-540c-809b-f8c94d0e68b5" for Bitcoin)'),
    quote_currency: z.string().optional().describe('Quote currency for price (default "USD")'),
  }),
  output: z.object({
    asset: assetSchema,
    latest_price: latestPriceSchema,
    categories: z.array(assetCategorySchema).describe('Asset categories'),
    networks: z.array(assetNetworkSchema).describe('Supported blockchain networks'),
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, {
      uuid: params.uuid,
      quoteCurrency: params.quote_currency ?? 'USD',
    });
    const a = data.assetByUuid;
    return {
      asset: mapAsset(a),
      latest_price: mapLatestPrice(a.latestPrice ?? {}),
      categories: (a.categories ?? []).map(mapAssetCategory),
      networks: (a.networks ?? []).map(mapAssetNetwork),
    };
  },
});
