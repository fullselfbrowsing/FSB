import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { orderSchema, mapOrder } from './schemas.js';

const QUERY = `query getConsumerOrdersWithDetails($offset: Int!, $limit: Int!, $includeCancelled: Boolean) {
  getConsumerOrdersWithDetails(offset: $offset, limit: $limit, includeCancelled: $includeCancelled) {
    id orderUuid deliveryUuid createdAt submittedAt cancelledAt fulfilledAt
    specialInstructions isGroup isGift isPickup isRetail fulfillmentType isReorderable
    creator { id firstName lastName }
    deliveryAddress { id formattedAddress }
    store { id name business { id name } phoneNumber }
    orders {
      id
      creator { id firstName lastName }
      items {
        id name quantity specialInstructions originalItemPrice
        purchaseQuantity { discreteQuantity { quantity unit } }
      }
    }
    paymentCard { id last4 type }
    grandTotal { unitAmount currency displayString }
  }
}`;

interface OrdersResponse {
  getConsumerOrdersWithDetails: Array<Record<string, unknown>>;
}

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description:
    'List DoorDash order history with full details including items, store, payment, and delivery info. Supports pagination via offset/limit. Returns orders sorted by most recent first.',
  summary: 'List your order history',
  icon: 'receipt',
  group: 'Orders',
  input: z.object({
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
    limit: z.number().int().min(1).max(50).optional().describe('Number of orders to return (default 10, max 50)'),
    include_cancelled: z.boolean().optional().describe('Include cancelled orders (default true)'),
  }),
  output: z.object({ orders: z.array(orderSchema).describe('Order history') }),
  handle: async params => {
    const data = await gql<OrdersResponse>('getConsumerOrdersWithDetails', QUERY, {
      offset: params.offset ?? 0,
      limit: params.limit ?? 10,
      includeCancelled: params.include_cancelled ?? true,
    });
    return { orders: (data.getConsumerOrdersWithDetails ?? []).map(mapOrder) };
  },
});
