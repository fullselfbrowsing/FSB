import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';

const permissionsSchema = z.object({
  can_create_shared_event_types: z.boolean().describe('Can create shared event types'),
  can_create_team: z.boolean().describe('Can create a team'),
  can_create_workflows: z.boolean().describe('Can create workflows'),
  can_list_teams: z.boolean().describe('Can list teams'),
  can_manage_ai_notetaker: z.boolean().describe('Can manage AI notetaker settings'),
  can_manage_domains: z.boolean().describe('Can manage verified domains'),
  can_manage_invitation: z.boolean().describe('Can manage invitations'),
  can_manage_invitation_permissions: z.boolean().describe('Can manage invitation permissions'),
  can_manage_organization_event_type_settings: z.boolean().describe('Can manage org-level event type settings'),
  can_manage_sso: z.boolean().describe('Can manage SSO configuration'),
  can_manage_user_access: z.boolean().describe('Can manage user access'),
  can_manage_user_provisioning: z.boolean().describe('Can manage user provisioning'),
  can_manage_workflows: z.boolean().describe('Can manage workflows'),
  can_use_workflows: z.boolean().describe('Can use workflows'),
});

export const getUserPermissions = defineTool({
  name: 'get_user_permissions',
  displayName: 'Get User Permissions',
  description:
    'Get the permission policy for the current user, showing what actions they can perform in the organization (create event types, manage teams, configure workflows, etc.).',
  summary: 'Get current user permissions and capabilities',
  icon: 'shield-check',
  group: 'Users',
  input: z.object({}),
  output: z.object({ permissions: permissionsSchema }),
  handle: async () => {
    const data = await api<Record<string, boolean>>('/policy');
    return {
      permissions: {
        can_create_shared_event_types: data.can_create_shared_event_types ?? false,
        can_create_team: data.can_create_team ?? false,
        can_create_workflows: data.can_create_workflows ?? false,
        can_list_teams: data.can_list_teams ?? false,
        can_manage_ai_notetaker: data.can_manage_ai_notetaker ?? false,
        can_manage_domains: data.can_manage_domains ?? false,
        can_manage_invitation: data.can_manage_invitation ?? false,
        can_manage_invitation_permissions: data.can_manage_invitation_permissions ?? false,
        can_manage_organization_event_type_settings: data.can_manage_organization_event_type_settings ?? false,
        can_manage_sso: data.can_manage_sso ?? false,
        can_manage_user_access: data.can_manage_user_access ?? false,
        can_manage_user_provisioning: data.can_manage_user_provisioning ?? false,
        can_manage_workflows: data.can_manage_workflows ?? false,
        can_use_workflows: data.can_use_workflows ?? false,
      },
    };
  },
});
