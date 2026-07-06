import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { orderFlowSchema, mapOrderFlow } from './schemas.js';
import type { RawOrderFlow } from './schemas.js';

export const getCustomerOrders = defineTool({
  name: 'get_customer_orders',
  displayName: 'Get Customer Orders',
  description:
    'Get aggregated customer order flow data showing the percentage of buy vs sell orders for securities. Useful for gauging market sentiment.',
  summary: 'View buy/sell order flow sentiment',
  icon: 'git-compare',
  group: 'Market Data',
  input: z.object({}),
  output: z.object({
    orders: z.array(orderFlowSchema).describe('Customer order flow data'),
  }),
  handle: async () => {
    interface OrdersResponse {
      customerOrders: RawOrderFlow[];
    }

    const query = `query GetCustomerOrders {
      customerOrders { symbol buysPct sellsPct todaysChgPct timestamp __typename }
    }`;

    const data = await portfolioGraphql<OrdersResponse>('GetCustomerOrders', query);

    return {
      orders: (data.customerOrders ?? []).map(o => mapOrderFlow(o)),
    };
  },
});
