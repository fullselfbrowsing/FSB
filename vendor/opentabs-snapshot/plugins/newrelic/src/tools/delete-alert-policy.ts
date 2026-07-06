import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const deleteAlertPolicy = defineTool({
  name: 'delete_alert_policy',
  displayName: 'Delete Alert Policy',
  description: 'Permanently delete an alert policy and all its conditions. This action cannot be undone.',
  summary: 'Delete an alert policy',
  icon: 'bell-minus',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    policy_id: z.string().min(1).describe('Alert policy ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await graphql<{
      alertsPolicyDelete: { id: string };
    }>(
      `mutation DeletePolicy($accountId: Int!, $id: ID!) {
        alertsPolicyDelete(accountId: $accountId, id: $id) {
          id
        }
      }`,
      { accountId: params.account_id, id: params.policy_id },
    );

    return { success: true };
  },
});
