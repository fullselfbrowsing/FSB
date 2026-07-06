import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { alertPolicySchema, mapAlertPolicy } from './schemas.js';
import type { RawAlertPolicy } from './schemas.js';

export const createAlertPolicy = defineTool({
  name: 'create_alert_policy',
  displayName: 'Create Alert Policy',
  description:
    'Create a new alert policy. The incident preference controls how incidents are grouped: PER_POLICY (one incident per policy), PER_CONDITION (one per condition), or PER_CONDITION_AND_TARGET (one per condition and target).',
  summary: 'Create an alert policy',
  icon: 'bell-plus',
  group: 'Alerts',
  input: z.object({
    account_id: z.number().int().describe('Account ID'),
    name: z.string().min(1).describe('Policy name'),
    incident_preference: z
      .enum(['PER_POLICY', 'PER_CONDITION', 'PER_CONDITION_AND_TARGET'])
      .optional()
      .describe('Incident grouping preference (default PER_POLICY)'),
  }),
  output: z.object({
    policy: alertPolicySchema.describe('Created alert policy'),
  }),
  handle: async params => {
    const data = await graphql<{
      alertsPolicyCreate: RawAlertPolicy;
    }>(
      `mutation CreatePolicy($accountId: Int!, $policy: AlertsPolicyInput!) {
        alertsPolicyCreate(accountId: $accountId, policy: $policy) {
          id name incidentPreference
        }
      }`,
      {
        accountId: params.account_id,
        policy: {
          name: params.name,
          incidentPreference: params.incident_preference ?? 'PER_POLICY',
        },
      },
    );

    return { policy: mapAlertPolicy(data.alertsPolicyCreate ?? {}) };
  },
});
