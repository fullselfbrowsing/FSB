import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapNrqlCondition, nrqlConditionSchema } from './schemas.js';
import type { RawNrqlCondition } from './schemas.js';

export const createNrqlCondition = defineTool({
  name: 'create_nrql_condition',
  displayName: 'Create NRQL Alert Condition',
  description:
    'Create a NRQL-based static alert condition. The condition evaluates the NRQL query and triggers when the result crosses the critical threshold.',
  summary: 'Create a NRQL alert condition',
  icon: 'alert-triangle',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    policy_id: z.string().min(1).describe('Alert policy ID to attach the condition to'),
    name: z.string().min(1).describe('Condition name'),
    nrql_query: z.string().min(1).describe('NRQL query (e.g., "SELECT count(*) FROM Transaction WHERE error IS true")'),
    critical_threshold: z.number().describe('Critical threshold value'),
    threshold_operator: z.enum(['ABOVE', 'BELOW', 'EQUALS']).optional().describe('Threshold operator (default ABOVE)'),
    threshold_duration: z
      .number()
      .int()
      .optional()
      .describe('Duration in seconds the threshold must be violated (default 300)'),
    threshold_occurrences: z
      .enum(['ALL', 'AT_LEAST_ONCE'])
      .optional()
      .describe('How many evaluation windows must violate (default ALL)'),
    enabled: z.boolean().optional().describe('Whether the condition is enabled (default true)'),
  }),
  output: z.object({
    condition: nrqlConditionSchema.describe('Created NRQL condition'),
  }),
  handle: async params => {
    const data = await graphql<{
      alertsNrqlConditionStaticCreate: RawNrqlCondition;
    }>(
      `mutation CreateNrqlCondition($accountId: Int!, $policyId: ID!, $condition: AlertsNrqlConditionStaticInput!) {
        alertsNrqlConditionStaticCreate(accountId: $accountId, policyId: $policyId, condition: $condition) {
          id name enabled policyId nrql { query } signal { aggregationWindow }
        }
      }`,
      {
        accountId: params.account_id,
        policyId: params.policy_id,
        condition: {
          name: params.name,
          enabled: params.enabled ?? true,
          nrql: { query: params.nrql_query },
          terms: [
            {
              priority: 'CRITICAL',
              threshold: params.critical_threshold,
              thresholdDuration: params.threshold_duration ?? 300,
              thresholdOccurrences: params.threshold_occurrences ?? 'ALL',
              operator: params.threshold_operator ?? 'ABOVE',
            },
          ],
        },
      },
    );
    return {
      condition: mapNrqlCondition(data.alertsNrqlConditionStaticCreate ?? {}),
    };
  },
});
