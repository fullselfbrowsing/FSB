import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapNrqlCondition, nrqlConditionSchema } from './schemas.js';
import type { RawNrqlCondition } from './schemas.js';

export const updateNrqlCondition = defineTool({
  name: 'update_nrql_condition',
  displayName: 'Update NRQL Alert Condition',
  description:
    'Update an existing NRQL alert condition. All fields are required — this replaces the entire condition definition.',
  summary: 'Update a NRQL alert condition',
  icon: 'pencil',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    condition_id: z.string().min(1).describe('Condition ID to update'),
    name: z.string().min(1).describe('Condition name'),
    nrql_query: z.string().min(1).describe('NRQL query'),
    critical_threshold: z.number().describe('Critical threshold value'),
    threshold_operator: z.enum(['ABOVE', 'BELOW', 'EQUALS']).optional().describe('Threshold operator (default ABOVE)'),
    threshold_duration: z.number().int().optional().describe('Duration in seconds (default 300)'),
    threshold_occurrences: z.enum(['ALL', 'AT_LEAST_ONCE']).optional().describe('Occurrences (default ALL)'),
    enabled: z.boolean().optional().describe('Whether the condition is enabled (default true)'),
  }),
  output: z.object({
    condition: nrqlConditionSchema.describe('Updated NRQL condition'),
  }),
  handle: async params => {
    const data = await graphql<{
      alertsNrqlConditionStaticUpdate: RawNrqlCondition;
    }>(
      `mutation UpdateNrqlCondition($accountId: Int!, $id: ID!, $condition: AlertsNrqlConditionUpdateStaticInput!) {
        alertsNrqlConditionStaticUpdate(accountId: $accountId, id: $id, condition: $condition) {
          id name enabled policyId nrql { query } signal { aggregationWindow }
        }
      }`,
      {
        accountId: params.account_id,
        id: params.condition_id,
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
      condition: mapNrqlCondition(data.alertsNrqlConditionStaticUpdate ?? {}),
    };
  },
});
