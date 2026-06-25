import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawStory, mapStory, storySchema } from './schemas.js';

export const listIterationStories = defineTool({
  name: 'list_iteration_stories',
  displayName: 'List Iteration Stories',
  description: 'List all stories that belong to a specific iteration (sprint).',
  summary: 'List stories in an iteration',
  icon: 'file-text',
  group: 'Iterations',
  input: z.object({
    iteration_id: z.number().int().describe('Iteration numeric ID'),
  }),
  output: z.object({ stories: z.array(storySchema).describe('Stories in the iteration') }),
  handle: async params => {
    const data = await api<RawStory[]>(`/iterations/${params.iteration_id}/stories`);
    return { stories: (data ?? []).map(mapStory) };
  },
});
