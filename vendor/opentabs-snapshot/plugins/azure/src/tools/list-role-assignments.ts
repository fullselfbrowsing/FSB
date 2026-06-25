import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawRoleAssignment, mapRoleAssignment, roleAssignmentSchema } from './schemas.js';

export const listRoleAssignments = defineTool({
  name: 'list_role_assignments',
  displayName: 'List Role Assignments',
  description:
    'List all RBAC role assignments for a subscription. Shows which principals have which roles at which scopes. Use the filter to narrow by principal ID or role definition.',
  summary: 'List RBAC role assignments',
  icon: 'users',
  group: 'Role Assignments',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    filter: z.string().optional().describe('OData filter expression (e.g., "principalId eq \'...\'" or "atScope()")'),
  }),
  output: z.object({
    role_assignments: z.array(roleAssignmentSchema).describe('List of role assignments'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawRoleAssignment>>(
      `/subscriptions/${params.subscription_id}/providers/Microsoft.Authorization/roleAssignments`,
      {
        apiVersion: '2022-04-01',
        query: { $filter: params.filter },
      },
    );
    return { role_assignments: (data.value ?? []).map(mapRoleAssignment) };
  },
});
