import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
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

export const getOrder = defineTool({
  name: 'get_order',
  displayName: 'Get Order',
  description:
    'Get a specific DoorDash order by its ID. Searches through order history to find the matching order. Returns full details including items, store, payment, and delivery info.',
  summary: 'Get details of a specific order',
  icon: 'package',
  group: 'Orders',
  input: z.object({
    order_id: z.string().describe('Order ID to look up'),
  }),
  output: z.object({ order: orderSchema }),
  handle: async params => {
    // DoorDash does not expose a single-order query; search through recent orders
    let offset = 0;
    const batchSize = 20;
    const maxSearchDepth = 100;

    while (offset < maxSearchDepth) {
      const data = await gql<OrdersResponse>('getConsumerOrdersWithDetails', QUERY, {
        offset,
        limit: batchSize,
        includeCancelled: true,
      });

      const orders = data.getConsumerOrdersWithDetails ?? [];
      if (orders.length === 0) break;

      for (const o of orders) {
        const raw = o as { id?: string; orderUuid?: string };
        if (raw.id === params.order_id || raw.orderUuid === params.order_id) {
          return { order: mapOrder(o) };
        }
      }

      offset += batchSize;
    }

    throw ToolError.notFound(`Order not found: ${params.order_id}`);
  },
});
