import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawFriendPlaytime, appUserDetailsSchema, mapFriendPlaytime } from './schemas.js';

interface AppUserDetailsResponse {
  [appid: string]: {
    success: boolean;
    data?: {
      is_owned?: boolean;
      added_to_wishlist?: boolean;
      friendsown?: RawFriendPlaytime[];
    };
  };
}

export const getAppUserDetails = defineTool({
  name: 'get_app_user_details',
  displayName: 'Get App User Details',
  description:
    "Get the current user's relationship with a specific app: whether they own it, whether it's on their wishlist, and which friends also own it with their playtime.",
  summary: 'Check ownership, wishlist status, and friends who own an app',
  icon: 'user-check',
  group: 'Library',
  input: z.object({
    appid: z.number().int().describe('Steam app ID to check'),
  }),
  output: z.object({
    details: appUserDetailsSchema,
  }),
  handle: async params => {
    const data = await storeGet<AppUserDetailsResponse>('/api/appuserdetails/', {
      appids: params.appid,
    });
    const entry = data[String(params.appid)];
    if (!entry?.success || !entry.data) {
      throw ToolError.notFound(`App ${params.appid} not found or user details unavailable.`);
    }
    const d = entry.data;
    return {
      details: {
        is_owned: d.is_owned ?? false,
        added_to_wishlist: d.added_to_wishlist ?? false,
        friends_own: (d.friendsown ?? []).map(mapFriendPlaytime),
      },
    };
  },
});
