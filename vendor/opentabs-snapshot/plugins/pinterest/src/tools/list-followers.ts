import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUser } from './schemas.js';

export const listFollowers = defineTool({
  name: 'list_followers',
  displayName: 'List Followers',
  description: 'List followers of a Pinterest user by username. Supports pagination via bookmark cursor.',
  summary: 'List followers of a user',
  icon: 'users',
  group: 'Social',
  input: z.object({
    username: z.string().describe('Pinterest username'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of followers per page (default 25, max 50)'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Follower users'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawUser[]>(
      'UserFollowersResource',
      {
        username: params.username,
        page_size: params.page_size ?? 25,
      },
      `/${params.username}/followers/`,
      params.bookmark,
    );

    const users = resp.resource_response.data ?? [];
    return {
      users: users.map(mapUser),
      bookmark: getBookmark(resp),
    };
  },
});
