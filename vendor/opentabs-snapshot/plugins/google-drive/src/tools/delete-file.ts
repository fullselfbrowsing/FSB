import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../google-drive-api.js';

export const deleteFile = defineTool({
  name: 'delete_file',
  displayName: 'Delete File',
  description:
    'Permanently delete a file or folder. This bypasses the trash — the file cannot be recovered. For a safer alternative, use trash_file to move it to trash first.',
  summary: 'Permanently delete a file or folder',
  icon: 'trash-2',
  group: 'Files',
  input: z.object({
    file_id: z.string().describe('File or folder ID to permanently delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await apiVoid(`/files/${encodeURIComponent(params.file_id)}`, { method: 'DELETE' });
    return { success: true };
  },
});
