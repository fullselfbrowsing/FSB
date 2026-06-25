import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { mapUser, userSchema } from './schemas.js';

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description:
    'Search for Jira users by name or email. Useful for finding account IDs to use with assign_issue or create_issue.',
  summary: 'Search for users by name or email',
  icon: 'users',
  group: 'Users',
  input: z.object({
    query: z
      .string()
      .optional()
      .describe('Search string to match against user display names and emails. Leave empty to list all users.'),
    max_results: z.number().optional().describe('Maximum number of users to return (default 20, max 50)'),
    start_at: z.number().optional().describe('Index of the first user to return for pagination'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Matching users'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>('/user/search', {
      query: {
        query: params.query ?? '',
        maxResults: params.max_results ?? 20,
        startAt: params.start_at ?? 0,
      },
    });
    const users = Array.isArray(data) ? data : [];
    return {
      users: users.map(mapUser),
    };
  },
});
