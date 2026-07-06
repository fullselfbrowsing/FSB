import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const deleteFolder = defineTool({
  name: 'delete_folder',
  displayName: 'Delete Folder',
  description:
    'Permanently delete a folder. The folder must be empty (no apps or subfolders). Use list_apps to find folder IDs.',
  summary: 'Delete an empty folder',
  icon: 'folder-minus',
  group: 'Apps',
  input: z.object({
    folder_id: z.number().describe('Folder ID to delete'),
  }),
  output: z.object({
    deleted_folder_id: z.number().describe('ID of the deleted folder'),
  }),
  handle: async params => {
    const data = await api<{ deletedFolderId: number }>('/api/folders/deleteFolder', {
      method: 'POST',
      body: { folderId: params.folder_id },
    });
    return { deleted_folder_id: data.deletedFolderId ?? 0 };
  },
});
