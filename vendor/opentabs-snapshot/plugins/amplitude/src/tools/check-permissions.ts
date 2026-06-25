import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';

const QUERY = `query RbacBatchCheckPermissions($input: BatchCheckPermissionsInput!) {
  rbacBatchCheckPermissions(input: $input) {
    results { action allowed }
  }
}`;

export const checkPermissions = defineTool({
  name: 'check_permissions',
  displayName: 'Check Permissions',
  description:
    'Check whether the current user has specific RBAC permissions. Common actions include: INVITE_NEW_USERS, VIEW_PROJECT_LIST, UPDATE_COHORT, CREATE_FEATURE_EXPERIMENT, AI_VIEW_GLOBAL_AGENT, AI_CREATE_GLOBAL_AGENT, UPDATE_BILLING_METHOD, READ_ACCESS_EXPERIMENT.',
  summary: 'Check user RBAC permissions',
  icon: 'shield',
  group: 'Permissions',
  input: z.object({
    actions: z
      .array(z.string())
      .describe('Permission action names to check (e.g., ["INVITE_NEW_USERS", "VIEW_PROJECT_LIST"])'),
    app_ids: z
      .array(z.number().int())
      .optional()
      .describe('App/project IDs to scope the permission check to (optional)'),
  }),
  output: z.object({
    results: z
      .array(
        z.object({
          action: z.string().describe('Permission action name'),
          allowed: z.boolean().describe('Whether the action is allowed'),
        }),
      )
      .describe('Permission check results'),
  }),
  handle: async params => {
    const input: Record<string, unknown> = { actions: params.actions };
    if (params.app_ids?.length) input.appIds = params.app_ids;

    const data = await gql<{
      rbacBatchCheckPermissions: {
        results: Array<{ action?: string; allowed?: boolean }>;
      };
    }>('RbacBatchCheckPermissions', QUERY, { input });

    return {
      results: (data.rbacBatchCheckPermissions?.results ?? []).map(r => ({
        action: r.action ?? '',
        allowed: r.allowed ?? false,
      })),
    };
  },
});
