import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';

const MUTATION = `mutation CreatePriceAlert($input: CreatePriceAlertInput!) {
  createPriceAlert(input: $input) {
    __typename
  }
}`;

export const createPriceAlert = defineTool({
  name: 'create_price_alert',
  displayName: 'Create Price Alert',
  description:
    'Create a price alert for a cryptocurrency asset. You will be notified when the asset price crosses the target price in the specified direction. Use get_asset_by_symbol to find the asset UUID.',
  summary: 'Create a price alert for an asset',
  icon: 'bell-plus',
  group: 'Alerts',
  input: z.object({
    asset_uuid: z.string().describe('Asset UUID to set the alert for'),
    target_price: z.string().describe('Target price as a decimal string (e.g. "75000.00")'),
    direction: z
      .enum(['ABOVE', 'BELOW'])
      .describe('Alert direction — ABOVE to notify when price rises above target, BELOW when it drops below'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the alert was created'),
  }),
  handle: async params => {
    await gql(MUTATION, {
      input: {
        assetUuid: params.asset_uuid,
        targetPrice: params.target_price,
        direction: params.direction,
      },
    });
    return { success: true };
  },
});
