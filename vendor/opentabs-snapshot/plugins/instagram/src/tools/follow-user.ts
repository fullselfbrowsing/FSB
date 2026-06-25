import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawFriendship, friendshipSchema, mapFriendship } from './schemas.js';

interface FriendshipResponse {
  friendship_status?: RawFriendship;
}

export const followUser = defineTool({
  name: 'follow_user',
  displayName: 'Follow User',
  description:
    'Follow an Instagram user. If the account is private, sends a follow request. Returns the updated friendship status.',
  summary: 'Follow a user',
  icon: 'user-plus',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
  }),
  output: z.object({ friendship: friendshipSchema }),
  handle: async params => {
    const data = await api<FriendshipResponse>(`/web/friendships/${params.user_id}/follow/`, {
      method: 'POST',
      body: '',
      formEncoded: true,
    });
    return { friendship: mapFriendship(data.friendship_status ?? {}) };
  },
});
