import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawStory, mapStory, storySchema } from './schemas.js';

export const listEpicStories = defineTool({
  name: 'list_epic_stories',
  displayName: 'List Epic Stories',
  description: 'List all stories that belong to a specific epic.',
  summary: 'List stories in an epic',
  icon: 'file-text',
  group: 'Epics',
  input: z.object({
    epic_id: z.number().int().describe('Epic numeric ID'),
  }),
  output: z.object({ stories: z.array(storySchema).describe('Stories in the epic') }),
  handle: async params => {
    const data = await api<RawStory[]>(`/epics/${params.epic_id}/stories`);
    return { stories: (data ?? []).map(mapStory) };
  },
});
