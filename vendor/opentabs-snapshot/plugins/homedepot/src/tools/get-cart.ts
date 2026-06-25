import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../homedepot-api.js';
import { cartItemSchema, cartTotalsSchema, mapCartItem, mapCartTotals } from './schemas.js';
import type { RawCartItem, RawCartTotals } from './schemas.js';

/** Minimal query that always succeeds (even with an empty cart) */
const SUMMARY_QUERY = `query getCart {
  cartInfo { cartId itemCount totals { total totalWithNoDiscount totalDiscount deliveryCharge } localization { primaryStoreId deliveryZip deliveryStateCode } }
}`;

/** Detailed query requesting cart items — only used when the cart has items */
const ITEMS_QUERY = `query getCart {
  cartInfo { items { id quantity product { itemId identifiers { productLabel brandName canonicalUrl } pricing { value total } media { images { url } } } fulfillmentType } }
}`;

interface RawCartSummary {
  cartId?: string;
  itemCount?: number;
  totals?: RawCartTotals;
  localization?: {
    primaryStoreId?: string;
    deliveryZip?: string;
    deliveryStateCode?: string;
  };
}

interface RawCartItems {
  items?: RawCartItem[];
}

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'View Cart',
  description:
    'Get the current Home Depot shopping cart contents including items, quantities, pricing, totals, and delivery information.',
  summary: 'View shopping cart contents',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    cart_id: z.string().nullable().describe('Cart ID (null if empty)'),
    item_count: z.number().int().describe('Total number of items in cart'),
    items: z.array(cartItemSchema).describe('Cart line items'),
    totals: cartTotalsSchema.describe('Cart totals breakdown'),
    delivery_zip: z.string().describe('Delivery ZIP code'),
    store_id: z.string().describe('Primary store ID for the cart'),
  }),
  handle: async () => {
    // Fetch summary first (always works even for empty carts)
    const summary = await gql<{ cartInfo: RawCartSummary }>('getCart', SUMMARY_QUERY, {}, 'my-cart');
    const cart = summary.cartInfo;
    const itemCount = cart.itemCount ?? 0;

    // Only fetch items if the cart has content
    let items: RawCartItem[] = [];
    if (itemCount > 0) {
      try {
        const detail = await gql<{ cartInfo: RawCartItems }>('getCart', ITEMS_QUERY, {}, 'my-cart');
        items = detail.cartInfo.items ?? [];
      } catch {
        // Items query may fail — return summary without items
      }
    }

    return {
      cart_id: cart.cartId ?? null,
      item_count: itemCount,
      items: items.map(mapCartItem),
      totals: mapCartTotals(cart.totals ?? {}),
      delivery_zip: cart.localization?.deliveryZip ?? '',
      store_id: cart.localization?.primaryStoreId ?? '',
    };
  },
});
