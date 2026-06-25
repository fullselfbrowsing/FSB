import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { userSchema, mapUser, extractUsersFromTimeline, extractCursor } from './schemas.js';

export const getFollowing = defineTool({
  name: 'get_following',
  displayName: 'Get Following',
  description: 'Get accounts that a user follows by their numeric user ID. Returns a paginated list of users.',
  summary: 'List accounts a user follows',
  icon: 'user-plus',
  group: 'Users',
  input: z.object({
    user_id: z.string().min(1).describe('User ID to get followers for'),
    count: z.int().min(1).max(50).optional().describe('Number of followers (default 20, max 50)'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  output: z.object({
    users: z.array(userSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const data = await graphqlQuery<Record<string, unknown>>('Following', {
      userId: params.user_id,
      count: params.count ?? 20,
      includePromotedContent: false,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    });

    const timelinePath = ['data', 'user', 'result', 'timeline', 'timeline'];
    const rawUsers = extractUsersFromTimeline(data, timelinePath);
    const nextCursor = extractCursor(data, timelinePath);

    return {
      users: rawUsers.map(mapUser),
      cursor: nextCursor,
    };
  },
});
