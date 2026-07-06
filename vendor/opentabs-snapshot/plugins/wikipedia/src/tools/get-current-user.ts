import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, isAuthenticated } from '../wikipedia-api.js';
import { userInfoSchema, mapUserInfo } from './schemas.js';
import type { RawUserInfo } from './schemas.js';

interface UserInfoResponse {
  query?: {
    userinfo?: RawUserInfo & { anon?: boolean };
  };
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently logged-in Wikipedia user including username, edit count, registration date, and user groups.',
  summary: 'Get the logged-in user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user: userInfoSchema,
  }),
  handle: async () => {
    if (!isAuthenticated()) {
      throw ToolError.auth('Not logged in to Wikipedia — please log in first.');
    }

    const data = await api<UserInfoResponse>({
      action: 'query',
      meta: 'userinfo',
      uiprop: 'editcount|registrationdate|groups',
    });

    const info = data.query?.userinfo;
    if (!info || info.anon) {
      throw ToolError.auth('Not logged in to Wikipedia — please log in first.');
    }

    return { user: mapUserInfo(info) };
  },
});
