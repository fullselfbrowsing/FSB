import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import {
  type ArmListResponse,
  type RawPolicyAssignment,
  mapPolicyAssignment,
  policyAssignmentSchema,
} from './schemas.js';

export const listPolicyAssignments = defineTool({
  name: 'list_policy_assignments',
  displayName: 'List Policy Assignments',
  description:
    'List all Azure Policy assignments for a subscription. Shows which policies are applied, their enforcement mode, and scope.',
  summary: 'List policy assignments',
  icon: 'shield-check',
  group: 'Policy',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    filter: z.string().optional().describe('OData filter expression'),
  }),
  output: z.object({
    policy_assignments: z.array(policyAssignmentSchema).describe('List of policy assignments'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawPolicyAssignment>>(
      `/subscriptions/${params.subscription_id}/providers/Microsoft.Authorization/policyAssignments`,
      {
        apiVersion: '2022-06-01',
        query: { $filter: params.filter },
      },
    );
    return { policy_assignments: (data.value ?? []).map(mapPolicyAssignment) };
  },
});
