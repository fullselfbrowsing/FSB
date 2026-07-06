import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';

export const moveResourceToFolder = defineTool({
  name: 'move_resource_to_folder',
  displayName: 'Move Resource to Folder',
  description: 'Move a resource (data source) to a different resource folder. Use list_resources to find resource IDs.',
  summary: 'Move a resource to a folder',
  icon: 'folder-input',
  group: 'Resources',
  input: z.object({
    resource_id: z.number().describe('Resource ID to move'),
    resource_folder_id: z.number().describe('Destination resource folder ID'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the move was successful'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>('/api/resourceFolders/moveResourceToFolder', {
      method: 'POST',
      body: {
        resourceId: params.resource_id,
        resourceFolderId: params.resource_folder_id,
      },
    });
    return { success: true };
  },
});
