import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../homedepot-api.js';
import { savedItemSchema, mapSavedItem } from './schemas.js';
import type { RawSavedItem } from './schemas.js';

const QUERY = `query getAllSaveForLaterItems {
  saveForLaterList {
    itemCount
    items { quantity product { media { images { url } } identifiers { itemId canonicalUrl brandName productLabel modelNumber storeSkuNumber productType } pricing { original value total } } }
  }
}`;

interface RawSaveForLaterList {
  itemCount?: number;
  items?: RawSavedItem[];
}

export const getSavedItems = defineTool({
  name: 'get_saved_items',
  displayName: 'Saved Items',
  description:
    'Get all items saved for later in the Home Depot cart. Returns product details, pricing, and quantities.',
  summary: 'Get Save For Later items',
  icon: 'bookmark',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    item_count: z.number().int().describe('Total number of saved items'),
    items: z.array(savedItemSchema).describe('Saved items list'),
  }),
  handle: async () => {
    const data = await gql<{ saveForLaterList: RawSaveForLaterList }>('getAllSaveForLaterItems', QUERY, {}, 'my-cart');

    const list = data.saveForLaterList;

    return {
      item_count: list.itemCount ?? 0,
      items: (list.items ?? []).map(mapSavedItem),
    };
  },
});
