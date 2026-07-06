import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orchestraApi } from '../starbucks-api.js';

const cartItemSchema = z.object({
  sku: z.string().describe('SKU of the product size (from get_product size data, e.g., "11186315")'),
  quantity: z.number().int().min(1).describe('Quantity of this item'),
  child_skus: z
    .array(z.string())
    .optional()
    .describe('Optional array of customization SKUs (syrups, milk, etc. from get_product options)'),
});

const pricedItemSchema = z.object({
  name: z.string().describe('Item name'),
  quantity: z.number().describe('Quantity'),
  price_label: z.string().describe('Formatted price (e.g., "$6.25")'),
  price: z.number().describe('Numeric price in dollars'),
  calories: z.string().describe('Calorie info (e.g., "290 Calories")'),
  image_url: z.string().describe('Product image URL'),
});

export const priceOrder = defineTool({
  name: 'price_order',
  displayName: 'Price Order',
  description:
    'Get pricing for a cart of items at a specific store. This does NOT place an order — it only calculates the total price. Provide items with their SKUs (from get_product) and the store number. Returns itemized pricing and the order total.',
  summary: 'Calculate order price without placing it',
  icon: 'calculator',
  group: 'Orders',
  input: z.object({
    store_number: z.string().describe('Store number to price the order at'),
    items: z.array(cartItemSchema).min(1).describe('Cart items with SKUs and quantities'),
  }),
  output: z.object({
    items: z.array(pricedItemSchema).describe('Priced line items'),
    subtotal: z.string().describe('Formatted subtotal (e.g., "$6.25")'),
    tax: z.string().describe('Formatted tax (e.g., "$0.00")'),
    total: z.string().describe('Formatted total (e.g., "$6.25")'),
    order_id: z.string().describe('Order ID for this pricing session'),
    expires_in_seconds: z.number().describe('Seconds until the pricing expires'),
  }),
  handle: async params => {
    const cartItems = params.items.map(item => ({
      quantity: item.quantity,
      commerce: { sku: item.sku },
      childItems: (item.child_skus ?? []).map(sku => ({
        commerce: { sku },
      })),
    }));

    interface SummaryLineItem {
      key?: string;
      priceLabel?: string;
    }

    interface PricedCartItem {
      label?: string;
      quantity?: number;
      priceLabel?: string;
      price?: number;
      calories?: string;
      masterImageUrl?: string;
    }

    interface PriceResponse {
      data?: {
        priceOrder?: {
          cart?: { items?: PricedCartItem[] };
          summary?: {
            priceLabel?: string;
            lineItems?: SummaryLineItem[];
          };
          orderId?: string;
          expiresIn?: number;
        };
      };
    }

    const data = await orchestraApi<PriceResponse>('price-order', {
      order: {
        cart: { items: cartItems, offers: [] },
        fulfillment: {
          consumptionType: 'CONSUME_OUT_OF_STORE',
          collectionType: 'IN_STORE',
        },
        storeNumber: params.store_number,
        enableTransparentPricing: true,
        enableNextGenLoyalty: true,
      },
    });

    const order = data.data?.priceOrder;
    const summaryLines = order?.summary?.lineItems ?? [];
    const subtotalLine = summaryLines.find(l => l.key === 'subtotal');
    const taxLine = summaryLines.find(l => l.key === 'tax');

    return {
      items: (order?.cart?.items ?? []).map(i => ({
        name: i.label ?? '',
        quantity: i.quantity ?? 1,
        price_label: i.priceLabel ?? '',
        price: i.price ?? 0,
        calories: i.calories ?? '',
        image_url: i.masterImageUrl ?? '',
      })),
      subtotal: subtotalLine?.priceLabel ?? '',
      tax: taxLine?.priceLabel ?? '',
      total: order?.summary?.priceLabel ?? '',
      order_id: order?.orderId ?? '',
      expires_in_seconds: order?.expiresIn ?? 0,
    };
  },
});
