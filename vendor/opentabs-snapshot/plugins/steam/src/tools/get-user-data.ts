import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawTag, mapTag, userDataSchema } from './schemas.js';

interface UserDataResponse {
  rgWishlist?: number[];
  rgOwnedApps?: number[];
  rgOwnedPackages?: number[];
  rgFollowedApps?: number[];
  rgIgnoredApps?: Record<string, number>;
  rgRecommendedTags?: RawTag[];
  nCartLineItemCount?: number;
}

export const getUserData = defineTool({
  name: 'get_user_data',
  displayName: 'Get User Data',
  description:
    "Get the current user's Steam store data including wishlisted app IDs, owned app IDs, owned package IDs, followed apps, ignored apps, recommended tags, and cart item count. Returns ID arrays — use get_app_details to resolve app names.",
  summary: 'Get wishlist, owned games, and preferences',
  icon: 'database',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user_data: userDataSchema,
  }),
  handle: async () => {
    const data = await storeGet<UserDataResponse>('/dynamicstore/userdata/');
    return {
      user_data: {
        wishlist: data.rgWishlist ?? [],
        owned_apps: data.rgOwnedApps ?? [],
        owned_packages: data.rgOwnedPackages ?? [],
        followed_apps: data.rgFollowedApps ?? [],
        ignored_apps: Object.keys(data.rgIgnoredApps ?? {}).map(Number),
        recommended_tags: (data.rgRecommendedTags ?? []).map(mapTag),
        cart_line_item_count: data.nCartLineItemCount ?? 0,
      },
    };
  },
});
