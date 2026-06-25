import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { iamUserSchema, mapIamUser, normalizeList } from './schemas.js';
import type { RawIamUser } from './schemas.js';

export const listIamUsers = defineTool({
  name: 'list_iam_users',
  displayName: 'List IAM Users',
  description: 'List IAM users in the account. IAM is a global service. Returns user name, ID, ARN, and creation date.',
  summary: 'List IAM users in the account',
  icon: 'users',
  group: 'IAM',
  input: z.object({
    max_items: z.number().int().min(1).max(1000).optional().describe('Maximum users to return (default 100)'),
    path_prefix: z.string().optional().describe('Filter by path prefix (e.g., /division_abc/)'),
  }),
  output: z.object({
    users: z.array(iamUserSchema).describe('List of IAM users'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {};
    if (params.max_items) queryParams.MaxItems = String(params.max_items);
    if (params.path_prefix) queryParams.PathPrefix = params.path_prefix;

    const data = await awsApi('iam', 'ListUsers', queryParams, { version: '2010-05-08' });
    const result = (data as Record<string, unknown>).ListUsersResult as Record<string, unknown> | undefined;
    const users = result?.Users as Record<string, unknown> | undefined;
    const items = normalizeList(users?.member as RawIamUser[]);
    return { users: items.map(mapIamUser) };
  },
});
