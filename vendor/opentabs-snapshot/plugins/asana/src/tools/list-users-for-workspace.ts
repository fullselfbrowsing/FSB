import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawUser, mapUser, userSchema } from './schemas.js';

export const listUsersForWorkspace = defineTool({
  name: 'list_users_for_workspace',
  displayName: 'List Users for Workspace',
  description: 'List all users in a workspace.',
  summary: 'List users in a workspace',
  icon: 'users',
  group: 'Users',
  input: z.object({
    workspace_gid: z.string().min(1).describe('Workspace GID to list users for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of users to return (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('List of users in the workspace'),
    next_page: z.string().nullable().describe('Offset token for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawUser>>(`/workspaces/${params.workspace_gid}/users`, {
      query: {
        opt_fields: 'name,email',
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      users: (data.data ?? []).map(mapUser),
      next_page: data.next_page?.offset ?? null,
    };
  },
});
