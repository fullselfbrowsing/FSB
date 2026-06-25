import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const createFolder = defineTool({
  name: 'create_folder',
  displayName: 'Create Folder',
  description: 'Create a new folder. Specify parent_id for nested folders, omit for root.',
  summary: 'Create a folder',
  icon: 'folder-plus',
  group: 'Files',
  input: z.object({
    name: z.string().min(1).describe('Folder name'),
    parent_id: z.string().optional().describe('Parent folder ID — omit for drive root'),
  }),
  output: z.object({ item: driveItemSchema }),
  handle: async params => {
    const base = params.parent_id ? `/me/drive/items/${params.parent_id}/children` : '/me/drive/root/children';

    const data = await api<RawDriveItem>(base, {
      method: 'POST',
      body: {
        name: params.name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      },
    });
    return { item: mapDriveItem(data) };
  },
});
