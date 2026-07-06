import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

interface ListUsersResponse {
  list?: RawUser[];
  hasMore?: boolean;
}

export const getListUsers = defineTool({
  name: 'get_list_users',
  displayName: 'Get List Users',
  description: 'Get users in a specific list. Works with both system lists (fans, following) and custom lists.',
  summary: 'Get users in a list',
  icon: 'users',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID (from list_user_lists)'),
    limit: z.number().int().min(1).max(50).optional().describe('Number of users to return (default 10)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Users in the list'),
    has_more: z.boolean().describe('Whether more users are available'),
  }),
  handle: async params => {
    const data = await api<ListUsersResponse>(`/lists/${encodeURIComponent(params.list_id)}/users`, {
      query: {
        limit: params.limit ?? 10,
        offset: params.offset ?? 0,
        skip_users: 'all',
      },
    });
    return {
      users: (data.list ?? []).map(mapUser),
      has_more: data.hasMore ?? false,
    };
  },
});
