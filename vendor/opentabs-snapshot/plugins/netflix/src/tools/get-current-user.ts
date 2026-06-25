import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserInfo } from '../netflix-api.js';
import { type RawUserInfo, mapUserInfo, userInfoSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently logged-in Netflix user profile information including account name, membership status, country, maturity level, and playback permissions.',
  summary: 'Get current Netflix user info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userInfoSchema }),
  handle: async () => {
    const data = getUserInfo();
    if (!data) {
      return { user: mapUserInfo({}) };
    }
    return { user: mapUserInfo(data as RawUserInfo) };
  },
});
