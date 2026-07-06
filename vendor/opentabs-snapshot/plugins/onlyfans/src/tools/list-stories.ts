import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawStoryMapEntry, mapStoryEntry, storySchema } from './schemas.js';

export const listStories = defineTool({
  name: 'list_stories',
  displayName: 'List Stories',
  description:
    'Get the stories map showing which creators have active stories. Returns a list of creators with story counts.',
  summary: 'List active stories from creators',
  icon: 'circle-play',
  group: 'Stories',
  input: z.object({}),
  output: z.object({
    stories: z.array(storySchema).describe('Creators with active stories'),
  }),
  handle: async () => {
    const data = await api<RawStoryMapEntry[]>('/stories/map');
    return { stories: (data ?? []).map(mapStoryEntry) };
  },
});
