import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData } from '../walmart-api.js';

const cartItemSchema = z.object({
  name: z.string().describe('Product name'),
  us_item_id: z.string().describe('Walmart US item ID'),
  quantity: z.number().int().describe('Quantity'),
  price: z.string().describe('Item price'),
  image_url: z.string().describe('Product image URL'),
});

interface RawCartItem {
  name?: string;
  usItemId?: string;
  quantity?: number;
  priceInfo?: {
    linePrice?: string;
    linePriceDisplay?: string;
    currentPrice?: { priceString?: string };
  };
  imageInfo?: { thumbnailUrl?: string };
}

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'Get Cart',
  description: 'View the current Walmart shopping cart contents including items, quantities, and totals.',
  summary: 'View current cart contents',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    item_count: z.number().int().describe('Number of items in cart'),
    items: z.array(cartItemSchema),
  }),
  handle: async () => {
    const data = await fetchPageData('/cart');

    const bootstrapData = data.bootstrapData as Record<string, unknown> | undefined;
    const cartData = bootstrapData?.cart as Record<string, unknown> | undefined;
    const bootstrapItemCount = (cartData?.itemCount as number) ?? 0;

    const initialData = data.initialData as Record<string, unknown> | undefined;
    const innerData = initialData?.data as Record<string, unknown> | undefined;
    const cart = innerData?.cart as Record<string, unknown> | undefined;

    const rawItems = (cart?.items ?? []) as RawCartItem[];

    const items = rawItems.map(i => ({
      name: i.name ?? '',
      us_item_id: i.usItemId ?? '',
      quantity: i.quantity ?? 1,
      price: i.priceInfo?.linePriceDisplay ?? i.priceInfo?.linePrice ?? i.priceInfo?.currentPrice?.priceString ?? '',
      image_url: i.imageInfo?.thumbnailUrl ?? '',
    }));

    return {
      item_count: items.length > 0 ? items.length : bootstrapItemCount,
      items,
    };
  },
});
