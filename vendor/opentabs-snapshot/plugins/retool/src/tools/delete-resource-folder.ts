import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const deleteResourceFolder = defineTool({
  name: 'delete_resource_folder',
  displayName: 'Delete Resource Folder',
  description: 'Delete a resource folder. The folder must be empty (no resources inside).',
  summary: 'Delete a resource folder',
  icon: 'folder-minus',
  group: 'Resources',
  input: z.object({
    resource_folder_id: z.number().describe('Resource folder ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>('/api/resourceFolders/deleteResourceFolder', {
      method: 'POST',
      body: { resourceFolderId: params.resource_folder_id },
    });
    return { success: true };
  },
});
