import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSSRData, extractUserDetail, normalizeUsername } from '../tiktok-api.js';
import { userSchema, userStatsSchema, mapSSRUser, mapUserStats } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a TikTok user profile by their username. Returns profile details including bio, follower counts, video count, and verification status.',
  summary: 'Get a user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('TikTok username without the @ prefix (e.g., "charlidamelio")'),
  }),
  output: z.object({
    user: userSchema.describe('User profile details'),
    stats: userStatsSchema.describe('User statistics'),
  }),
  handle: async params => {
    const username = normalizeUsername(params.username);
    const scope = await fetchSSRData(`/@${username}`);
    const detail = extractUserDetail(scope);

    if (!detail?.userInfo?.user?.id) {
      throw ToolError.notFound(`User @${username} not found.`);
    }

    return {
      user: mapSSRUser(detail.userInfo.user),
      stats: mapUserStats(detail.userInfo.stats ?? {}),
    };
  },
});
