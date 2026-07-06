import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet, getBookmark } from '../pinterest-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUser } from './schemas.js';

export const listFollowing = defineTool({
  name: 'list_following',
  displayName: 'List Following',
  description: 'List users that a Pinterest user is following, by username. Supports pagination via bookmark cursor.',
  summary: 'List users a user is following',
  icon: 'users',
  group: 'Social',
  input: z.object({
    username: z.string().describe('Pinterest username'),
    page_size: z.number().int().min(1).max(50).optional().describe('Number of results per page (default 25, max 50)'),
    bookmark: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Users being followed'),
    bookmark: z.string().describe('Cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawUser[]>(
      'UserFollowingResource',
      {
        username: params.username,
        page_size: params.page_size ?? 25,
      },
      `/${params.username}/following/`,
      params.bookmark,
    );

    const users = resp.resource_response.data ?? [];
    return {
      users: users.map(mapUser),
      bookmark: getBookmark(resp),
    };
  },
});
