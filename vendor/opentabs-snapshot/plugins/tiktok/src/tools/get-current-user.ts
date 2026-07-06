import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentAuth, fetchSSRData, extractUserDetail } from '../tiktok-api.js';
import { userSchema, userStatsSchema, mapSSRUser, mapUserStats } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated TikTok user including username, bio, follower counts, and video count.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Authenticated user profile'),
    stats: userStatsSchema.describe('Authenticated user statistics'),
  }),
  handle: async () => {
    const auth = getCurrentAuth();
    const scope = await fetchSSRData(`/@${auth.uniqueId}`);
    const detail = extractUserDetail(scope);

    if (!detail?.userInfo?.user?.id) {
      throw ToolError.internal('Failed to load current user profile from TikTok.');
    }

    return {
      user: mapSSRUser(detail.userInfo.user),
      stats: mapUserStats(detail.userInfo.stats ?? {}),
    };
  },
});
