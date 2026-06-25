import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getReduxSlice } from '../starbucks-api.js';

const cartItemSchema = z.object({
  item_key: z.string().describe('Cart item key (e.g., "34833/iced:Grande") — use with update_product_quantity'),
  name: z.string().describe('Product name'),
  product_number: z.number().describe('Product number'),
  form: z.string().describe('Product form (e.g., "Iced", "Hot")'),
  size: z.string().describe('Size name (e.g., "Grande")'),
  sku: z.string().describe('SKU for the selected size'),
  quantity: z.number().describe('Quantity in cart'),
  image_url: z.string().describe('Product image URL'),
});

interface CartItemData {
  product?: {
    name?: string;
    productNumber?: number;
    formCode?: string;
    imageURL?: string;
  };
  size?: { name?: string; sku?: string };
  sizeCode?: string;
  quantity?: number;
}

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'Get Cart',
  description: 'View the current cart contents including all products, quantities, and the cart total.',
  summary: 'View current cart contents',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    items: z.array(cartItemSchema).describe('Items in the cart'),
    item_count: z.number().describe('Total number of items (sum of quantities)'),
  }),
  handle: async () => {
    const cart = getReduxSlice<Record<string, CartItemData>>('ordering.cart.current');
    if (!cart) return { items: [], item_count: 0 };

    const items = Object.entries(cart).map(([key, item]) => ({
      item_key: key,
      name: item.product?.name ?? '',
      product_number: item.product?.productNumber ?? 0,
      form: item.product?.formCode ?? '',
      size: item.sizeCode ?? item.size?.name ?? '',
      sku: item.size?.sku ?? '',
      quantity: item.quantity ?? 1,
      image_url: item.product?.imageURL ?? '',
    }));

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return { items, item_count: itemCount };
  },
});
