import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const listUsers = defineTool({
  name: 'list_users',
  displayName: 'List Users',
  description: 'List users in the Zendesk account. Optionally filter by role and paginate results.',
  summary: 'List users with optional role filter',
  icon: 'users',
  group: 'Users',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Number of results per page (default 25, max 100)'),
    role: z.enum(['end-user', 'agent', 'admin']).optional().describe('Filter by user role'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('List of users'),
    count: z.number().int().describe('Total number of users matching the filter'),
  }),
  handle: async params => {
    const data = await api<{ users: RawUser[]; count: number }>('/users.json', {
      query: {
        page: params.page,
        per_page: params.per_page,
        role: params.role,
      },
    });
    return {
      users: (data.users ?? []).map(mapUser),
      count: data.count ?? 0,
    };
  },
});
