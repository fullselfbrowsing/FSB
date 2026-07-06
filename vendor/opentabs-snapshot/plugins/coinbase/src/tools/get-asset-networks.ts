import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawAssetNetwork, assetNetworkSchema, mapAssetNetwork } from './schemas.js';

const QUERY = `query GetAssetNetworks($uuid: Uuid!) {
  assetByUuid(uuid: $uuid) {
    name symbol
    networks { displayName chainId contractAddress }
  }
}`;

interface Response {
  assetByUuid: {
    name?: string;
    symbol?: string;
    networks?: RawAssetNetwork[];
  };
}

export const getAssetNetworks = defineTool({
  name: 'get_asset_networks',
  displayName: 'Get Asset Networks',
  description:
    'Get the blockchain networks that support a cryptocurrency asset, including network name, EVM chain ID, and token contract address. Useful for identifying which chains an asset can be sent/received on.',
  summary: 'Get supported networks for an asset',
  icon: 'network',
  group: 'Assets',
  input: z.object({
    uuid: z.string().describe('Asset UUID'),
  }),
  output: z.object({
    asset_name: z.string().describe('Asset name'),
    asset_symbol: z.string().describe('Ticker symbol'),
    networks: z.array(assetNetworkSchema).describe('Supported blockchain networks'),
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, { uuid: params.uuid });
    const a = data.assetByUuid;
    return {
      asset_name: a.name ?? '',
      asset_symbol: a.symbol ?? '',
      networks: (a.networks ?? []).map(mapAssetNetwork),
    };
  },
});
