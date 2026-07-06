import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawStoryTray, mapStoryTray, storyTraySchema } from './schemas.js';

interface TrayResponse {
  tray?: RawStoryTray[];
}

export const getStoriesTray = defineTool({
  name: 'get_stories_tray',
  displayName: 'Get Stories Tray',
  description:
    'Get the stories tray showing which followed users currently have active stories. Use get_user_stories with a user ID to view the actual story items.',
  summary: 'Get stories from followed users',
  icon: 'circle-play',
  group: 'Feed',
  input: z.object({}),
  output: z.object({
    stories: z.array(storyTraySchema).describe('Users with active stories'),
  }),
  handle: async () => {
    const data = await api<TrayResponse>('/feed/reels_tray/');
    return {
      stories: (data.tray ?? []).map(mapStoryTray),
    };
  },
});
