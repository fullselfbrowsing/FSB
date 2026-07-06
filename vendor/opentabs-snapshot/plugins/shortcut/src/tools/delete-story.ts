import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';

export const deleteStory = defineTool({
  name: 'delete_story',
  displayName: 'Delete Story',
  description: 'Permanently delete a story by its numeric ID. This action cannot be undone.',
  summary: 'Delete a story',
  icon: 'trash-2',
  group: 'Stories',
  input: z.object({
    story_id: z.number().int().describe('Story numeric ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api(`/stories/${params.story_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
