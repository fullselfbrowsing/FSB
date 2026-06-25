import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../google-drive-api.js';

export const emptyTrash = defineTool({
  name: 'empty_trash',
  displayName: 'Empty Trash',
  description:
    'Permanently delete all files in the trash. This action cannot be undone. All trashed files will be permanently removed.',
  summary: 'Permanently delete all trashed files',
  icon: 'trash-2',
  group: 'Files',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async () => {
    await apiVoid('/files/trash', { method: 'DELETE' });
    return { success: true };
  },
});
