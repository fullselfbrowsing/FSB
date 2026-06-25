import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawFriendship, friendshipSchema, mapFriendship } from './schemas.js';

interface FriendshipResponse {
  friendship_status?: RawFriendship;
}

export const unfollowUser = defineTool({
  name: 'unfollow_user',
  displayName: 'Unfollow User',
  description: 'Unfollow an Instagram user. Returns the updated friendship status.',
  summary: 'Unfollow a user',
  icon: 'user-minus',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
  }),
  output: z.object({ friendship: friendshipSchema }),
  handle: async params => {
    const data = await api<FriendshipResponse>(`/web/friendships/${params.user_id}/unfollow/`, {
      method: 'POST',
      body: '',
      formEncoded: true,
    });
    return { friendship: mapFriendship(data.friendship_status ?? {}) };
  },
});
