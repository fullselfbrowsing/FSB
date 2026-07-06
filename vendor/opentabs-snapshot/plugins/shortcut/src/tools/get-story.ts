import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawStory, mapStoryDetail, storyDetailSchema } from './schemas.js';

export const getStory = defineTool({
  name: 'get_story',
  displayName: 'Get Story',
  description:
    'Get detailed information about a specific story by its numeric ID. Returns full story data including labels, story links, comment IDs, and task IDs.',
  summary: 'Get a story by ID',
  icon: 'file-text',
  group: 'Stories',
  input: z.object({
    story_id: z.number().int().describe('Story numeric ID'),
  }),
  output: z.object({ story: storyDetailSchema }),
  handle: async params => {
    const data = await api<RawStory>(`/stories/${params.story_id}`);
    return { story: mapStoryDetail(data) };
  },
});
