import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const deleteSection = defineTool({
  name: 'delete_section',
  displayName: 'Delete Section',
  description: 'Permanently delete a section by its ID. Tasks in the section are moved to the parent project.',
  summary: 'Delete a section',
  icon: 'layout-list',
  group: 'Sections',
  input: z.object({
    section_id: z.string().describe('Section ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the section was deleted'),
  }),
  handle: async params => {
    await apiVoid(`/sections/${params.section_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
