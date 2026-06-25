import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const deleteNrqlCondition = defineTool({
  name: 'delete_nrql_condition',
  displayName: 'Delete NRQL Alert Condition',
  description: 'Permanently delete a NRQL alert condition. This action cannot be undone.',
  summary: 'Delete a NRQL alert condition',
  icon: 'trash-2',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    condition_id: z.string().min(1).describe('Condition ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await graphql<{
      alertsConditionDelete: { id: string };
    }>(
      `mutation DeleteCondition($accountId: Int!, $id: ID!) {
        alertsConditionDelete(accountId: $accountId, id: $id) {
          id
        }
      }`,
      { accountId: params.account_id, id: params.condition_id },
    );

    return { success: true };
  },
});
