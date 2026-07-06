import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawAssetCategory, assetCategorySchema, mapAssetCategory } from './schemas.js';

const QUERY = `query GetAssetCategories($uuid: Uuid!) {
  assetByUuid(uuid: $uuid) {
    categories { uuid name slug description }
  }
}`;

interface Response {
  assetByUuid: { categories?: RawAssetCategory[] };
}

export const getAssetCategories = defineTool({
  name: 'get_asset_categories',
  displayName: 'Get Asset Categories',
  description:
    'Get the categories that a cryptocurrency asset belongs to (e.g. "Currencies", "DeFi", "Layer 2"). Use get_asset_by_symbol to find the asset UUID first.',
  summary: 'Get categories for an asset',
  icon: 'tag',
  group: 'Assets',
  input: z.object({
    uuid: z.string().describe('Asset UUID'),
  }),
  output: z.object({
    categories: z.array(assetCategorySchema).describe('Categories the asset belongs to'),
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, { uuid: params.uuid });
    return {
      categories: (data.assetByUuid.categories ?? []).map(mapAssetCategory),
    };
  },
});
