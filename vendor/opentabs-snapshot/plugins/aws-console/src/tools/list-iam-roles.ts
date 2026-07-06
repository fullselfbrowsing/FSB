import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { iamRoleSchema, mapIamRole, normalizeList } from './schemas.js';
import type { RawIamRole } from './schemas.js';

export const listIamRoles = defineTool({
  name: 'list_iam_roles',
  displayName: 'List IAM Roles',
  description: 'List IAM roles in the account. IAM is a global service. Returns role name, ID, ARN, and creation date.',
  summary: 'List IAM roles in the account',
  icon: 'key-round',
  group: 'IAM',
  input: z.object({
    max_items: z.number().int().min(1).max(1000).optional().describe('Maximum roles to return (default 100)'),
    path_prefix: z.string().optional().describe('Filter by path prefix (e.g., /service-role/)'),
  }),
  output: z.object({
    roles: z.array(iamRoleSchema).describe('List of IAM roles'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {};
    if (params.max_items) queryParams.MaxItems = String(params.max_items);
    if (params.path_prefix) queryParams.PathPrefix = params.path_prefix;

    const data = await awsApi('iam', 'ListRoles', queryParams, { version: '2010-05-08' });
    const result = (data as Record<string, unknown>).ListRolesResult as Record<string, unknown> | undefined;
    const roles = result?.Roles as Record<string, unknown> | undefined;
    const items = normalizeList(roles?.member as RawIamRole[]);
    return { roles: items.map(mapIamRole) };
  },
});
