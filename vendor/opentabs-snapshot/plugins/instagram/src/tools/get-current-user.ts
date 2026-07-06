import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getCurrentUserId } from '../instagram-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

interface WebFormDataResponse {
  form_data?: {
    username?: string;
    first_name?: string;
    biography?: string;
    email?: string;
    phone_number?: string;
    is_private?: boolean;
  };
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Instagram user profile including username, bio, follower/following counts, and post count.',
  summary: 'Get the logged-in user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const userId = getCurrentUserId();

    const formData = await api<WebFormDataResponse>('/accounts/edit/web_form_data/');

    const profileData = await api<{ data?: { user?: RawUser } }>(`/users/web_profile_info/`, {
      query: { username: formData.form_data?.username ?? '' },
    });

    const user = profileData.data?.user ?? {};
    return {
      user: {
        ...mapUser({ ...user, pk: userId }),
        full_name: formData.form_data?.first_name ?? user.full_name ?? '',
        biography: formData.form_data?.biography ?? user.biography ?? '',
      },
    };
  },
});
