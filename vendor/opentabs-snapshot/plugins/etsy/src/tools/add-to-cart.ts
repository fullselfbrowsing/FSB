// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../etsy-api.js';

export const addToCart = defineTool({
  name: 'add_to_cart',
  displayName: 'Add to Cart',
  description: 'Add an Etsy listing to your shopping cart. This does NOT charge -- it stages the item for a later checkout.',
  summary: 'add an item to my etsy cart',
  icon: 'plus-circle',
  group: 'Cart',
  input: z.object({
    listing_id: z.string().min(1).describe('The listing ID to add to the cart'),
    quantity: z.number().int().min(1).optional().describe('Quantity to add (default 1)'),
    variation: z.string().optional().describe('Optional product variation (size, color)'),
  }),
  output: z.object({
    cart: z.object({
      item_count: z.number(),
    }).describe('The updated cart'),
  }),
  handle: async (params: { listing_id: string; quantity?: number; variation?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/cart/items -- ADDS to the
    // cart (add -> a WRITE via {method:'POST'}; NOT a payment op -- the cart does not
    // charge; the payment op is checkout). backing:'dom' keeps it DOM-only.
    const data = await api<{ cart: { item_count: number } }>('/v1/cart/items', {
      method: 'POST',
      body: { listing_id: params.listing_id, quantity: params.quantity, variation: params.variation },
    });
    return { cart: data.cart };
  },
});
