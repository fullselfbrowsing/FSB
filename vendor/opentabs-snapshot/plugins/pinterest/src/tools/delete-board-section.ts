import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';

export const deleteBoardSection = defineTool({
  name: 'delete_board_section',
  displayName: 'Delete Board Section',
  description:
    'Delete a section from a board. Pins in the section are moved back to the board. This action cannot be undone.',
  summary: 'Delete a board section',
  icon: 'layers',
  group: 'Boards',
  input: z.object({
    section_id: z.string().describe('Section ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await resourcePost('BoardSectionEditResource', 'delete', {
      section_id: params.section_id,
    });

    return { success: true };
  },
});
