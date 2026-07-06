import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawPolicyAssignment, mapPolicyAssignment, policyAssignmentSchema } from './schemas.js';

export const getPolicyAssignment = defineTool({
  name: 'get_policy_assignment',
  displayName: 'Get Policy Assignment',
  description: 'Get detailed information about a specific Azure Policy assignment by name.',
  summary: 'Get policy assignment details',
  icon: 'shield-check',
  group: 'Policy',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    policy_assignment_name: z.string().describe('Policy assignment name'),
  }),
  output: z.object({ policy_assignment: policyAssignmentSchema }),
  handle: async params => {
    const data = await armApi<RawPolicyAssignment>(
      `/subscriptions/${params.subscription_id}/providers/Microsoft.Authorization/policyAssignments/${params.policy_assignment_name}`,
      { apiVersion: '2022-06-01' },
    );
    return { policy_assignment: mapPolicyAssignment(data) };
  },
});
