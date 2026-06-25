import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawFriendship, friendshipSchema, mapFriendship } from './schemas.js';

export const getFriendshipStatus = defineTool({
  name: 'get_friendship_status',
  displayName: 'Get Friendship Status',
  description:
    'Check the relationship between the authenticated user and another user. Returns follow status, blocking, muting, and request states.',
  summary: 'Check relationship with a user',
  icon: 'users',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
  }),
  output: z.object({ friendship: friendshipSchema }),
  handle: async params => {
    const data = await api<RawFriendship>(`/friendships/show/${params.user_id}/`);
    return { friendship: mapFriendship(data) };
  },
});
