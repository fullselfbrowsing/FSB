import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { userSchema, mapUser } from './schemas.js';

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description:
    'Search Stack Overflow users by display name. Returns matching user profiles sorted by reputation, creation date, or name.',
  summary: 'Search users by display name',
  icon: 'users',
  group: 'Users',
  input: z.object({
    inname: z.string().describe('Search string to match against display names'),
    sort: z
      .enum(['reputation', 'creation', 'name', 'modified'])
      .optional()
      .describe('Sort order (default: reputation)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Matching users'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/users', {
      query: {
        inname: params.inname,
        sort: params.sort ?? 'reputation',
        order: params.order ?? 'desc',
        page: params.page,
        pagesize: params.pagesize,
      },
    });
    return {
      users: (data.items ?? []).map(mapUser),
      has_more: data.has_more ?? false,
      quota_remaining: data.quota_remaining ?? 0,
    };
  },
});
