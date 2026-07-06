import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';

export const deleteBoard = defineTool({
  name: 'delete_board',
  displayName: 'Delete Board',
  description: 'Delete a board and all its pins. Only works for boards you own. This action cannot be undone.',
  summary: 'Delete a board',
  icon: 'folder-x',
  group: 'Boards',
  input: z.object({
    board_id: z.string().describe('Board ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await resourcePost('BoardResource', 'delete', {
      board_id: params.board_id,
    });

    return { success: true };
  },
});
