import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawUserSummary, mapUserSummary, userSummarySchema } from './schemas.js';

interface LikersResponse {
  users?: RawUserSummary[];
  user_count?: number;
}

export const getPostLikers = defineTool({
  name: 'get_post_likers',
  displayName: 'Get Post Likers',
  description: 'Get users who liked a post. Returns a list of user profiles and total like count.',
  summary: 'Get users who liked a post',
  icon: 'heart',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk'),
  }),
  output: z.object({
    users: z.array(userSummarySchema).describe('Users who liked the post'),
    user_count: z.number().int().describe('Total number of likers'),
  }),
  handle: async params => {
    const data = await api<LikersResponse>(`/media/${params.media_id}/likers/`);
    return {
      users: (data.users ?? []).map(mapUserSummary),
      user_count: data.user_count ?? 0,
    };
  },
});
