import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawPriceAlert, mapPriceAlert, priceAlertSchema } from './schemas.js';

const QUERY = `query ListPriceAlerts($first: Int!) {
  viewer {
    priceAlerts(first: $first) {
      edges {
        node {
          uuid targetPrice direction
          asset { name symbol }
        }
      }
      totalCount
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

interface Response {
  viewer: {
    priceAlerts: {
      edges: Array<{ node: RawPriceAlert }>;
      totalCount?: number;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string };
    };
  };
}

export const listPriceAlerts = defineTool({
  name: 'list_price_alerts',
  displayName: 'List Price Alerts',
  description:
    'List all active price alerts for the authenticated user. Price alerts notify the user when an asset reaches a target price. Returns alert details including target price, direction, and associated asset.',
  summary: 'List all price alerts',
  icon: 'bell',
  group: 'Alerts',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of alerts to return (default 50)'),
  }),
  output: z.object({
    alerts: z.array(priceAlertSchema).describe('List of active price alerts'),
    total_count: z.number().describe('Total number of alerts'),
  }),
  handle: async params => {
    const data = await gql<Response>(QUERY, { first: params.limit ?? 50 });
    const conn = data.viewer.priceAlerts;
    return {
      alerts: (conn.edges ?? []).map(e => mapPriceAlert(e.node)),
      total_count: conn.totalCount ?? 0,
    };
  },
});
