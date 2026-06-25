import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveSecUid } from '../tiktok-api.js';
import { listUserSchema, mapListUser } from './schemas.js';
import type { UserListResponse } from './schemas.js';

export const getFollowing = defineTool({
  name: 'get_following',
  displayName: 'Get Following',
  description:
    "Get the list of accounts that a TikTok user follows. Requires the user's secure user ID (secUid). Use get_user_profile to find a user's secUid from their username. Supports cursor-based pagination.",
  summary: 'Get accounts a user follows',
  icon: 'user-plus',
  group: 'Users',
  input: z.object({
    username: z.string().optional().describe('Username to look up secUid (alternative to providing sec_uid directly)'),
    sec_uid: z.string().optional().describe('Secure user ID (secUid) — use get_user_profile to find this'),
    count: z.number().int().min(1).max(30).optional().describe('Number of results (default 20, max 30)'),
    cursor: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination cursor (maxCursor from previous response, default 0)'),
  }),
  output: z.object({
    users: z.array(listUserSchema).describe('List of followed accounts'),
    has_more: z.boolean().describe('Whether more results are available'),
    cursor: z.number().int().describe('Cursor for the next page (pass as cursor parameter)'),
    total: z.number().int().describe('Total number of accounts followed'),
  }),
  handle: async params => {
    let secUid = params.sec_uid;

    if (!secUid && params.username) {
      secUid = await resolveSecUid(params.username);
    }

    if (!secUid) {
      throw ToolError.validation('Either username or sec_uid is required.');
    }

    const count = params.count ?? 20;
    const cursor = params.cursor ?? 0;

    const data = await api<UserListResponse>('/user/list/', {
      secUid,
      count,
      minCursor: 0,
      maxCursor: cursor,
      scene: 21, // 21 = following
    });

    const users = (data.userList ?? []).map(mapListUser);

    return {
      users,
      has_more: data.hasMore ?? false,
      cursor: data.maxCursor ?? 0,
      total: data.total ?? 0,
    };
  },
});
