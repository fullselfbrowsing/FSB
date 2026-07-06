import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES, getCurrentUserId } from '../airbnb-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the currently authenticated Airbnb user profile including avatar URL, host status, and user ID.',
  summary: 'Get the current Airbnb user profile',
  icon: 'user',
  group: 'User',
  input: z.object({}),
  output: z.object({
    user: z
      .object({
        id: z.string().nullable().describe('Numeric user ID from cookies'),
        avatar_url: z.string().nullable().describe('URL of the user avatar image'),
        is_host: z.boolean().describe('Whether the user is an experience host'),
        is_service_host: z.boolean().describe('Whether the user is a service host'),
      })
      .describe('Current user profile'),
  }),
  handle: async () => {
    const data = await graphql<{
      viewer: { user: { isExperienceHostV2?: boolean; isServiceHost?: boolean } };
      presentation: { header: { avatarImageUrl?: string | null } };
    }>('Header', QUERY_HASHES.Header, {
      cdnCacheSafe: false,
      hasLoggedIn: true,
      isInitialLoad: false,
      source: 'EXPLORE',
      supportsM13ListingsSetupFlow: true,
    });

    const userId = getCurrentUserId();

    return {
      user: {
        id: userId,
        avatar_url: data.presentation.header.avatarImageUrl ?? null,
        is_host: data.viewer.user.isExperienceHostV2 ?? false,
        is_service_host: data.viewer.user.isServiceHost ?? false,
      },
    };
  },
});
