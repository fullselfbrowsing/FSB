import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawStory, STORY_OPT_FIELDS, mapStory, storySchema } from './schemas.js';

export const createStory = defineTool({
  name: 'create_story',
  displayName: 'Create Story',
  description: 'Add a comment to a task.',
  summary: 'Add a comment to a task',
  icon: 'message-square-plus',
  group: 'Stories',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to add the comment to'),
    text: z.string().min(1).describe('Comment text to post on the task'),
  }),
  output: z.object({
    story: storySchema.describe('The created story'),
  }),
  handle: async params => {
    const data = await api<AsanaResponse<RawStory>>(`/tasks/${params.task_gid}/stories`, {
      method: 'POST',
      body: { data: { text: params.text } },
      query: { opt_fields: STORY_OPT_FIELDS },
    });
    return { story: mapStory(data.data) };
  },
});
