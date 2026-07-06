import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import {
  type RawStoryItem,
  type RawUserSummary,
  mapStoryItem,
  mapUserSummary,
  storyItemSchema,
  userSummarySchema,
} from './schemas.js';

interface StoryResponse {
  reel?: {
    user?: RawUserSummary;
    items?: RawStoryItem[];
  };
}

export const getUserStories = defineTool({
  name: 'get_user_stories',
  displayName: 'Get User Stories',
  description: 'Get active stories from a specific user. Stories expire after 24 hours. Requires the user numeric ID.',
  summary: "Get a user's active stories",
  icon: 'circle-play',
  group: 'Users',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
  }),
  output: z.object({
    user: userSummarySchema.describe('Story owner'),
    items: z.array(storyItemSchema).describe('Story items'),
  }),
  handle: async params => {
    const data = await api<StoryResponse>(`/feed/user/${params.user_id}/story/`);
    return {
      user: mapUserSummary(data.reel?.user ?? {}),
      items: (data.reel?.items ?? []).map(mapStoryItem),
    };
  },
});
