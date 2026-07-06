import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';

const MUTATION = `mutation DeletePriceAlert($input: DeletePriceAlertInput!) {
  deletePriceAlert(input: $input) {
    __typename
  }
}`;

export const deletePriceAlert = defineTool({
  name: 'delete_price_alert',
  displayName: 'Delete Price Alert',
  description: 'Delete an existing price alert by its UUID. Use list_price_alerts to find alert UUIDs.',
  summary: 'Delete a price alert',
  icon: 'bell-minus',
  group: 'Alerts',
  input: z.object({
    alert_uuid: z.string().describe('UUID of the price alert to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await gql(MUTATION, {
      input: { priceAlertUuid: params.alert_uuid },
    });
    return { success: true };
  },
});
