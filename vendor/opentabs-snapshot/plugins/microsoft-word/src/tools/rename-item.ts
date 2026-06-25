import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const renameItem = defineTool({
  name: 'rename_item',
  displayName: 'Rename Item',
  description: 'Rename a file or folder.',
  summary: 'Rename a file or folder',
  icon: 'pencil',
  group: 'Files',
  input: z.object({
    item_id: z.string().describe('File or folder ID'),
    name: z.string().min(1).describe('New name for the item'),
  }),
  output: z.object({
    item: driveItemSchema.describe('The renamed item'),
  }),
  handle: async params => {
    const data = await api<RawDriveItem>(`/me/drive/items/${params.item_id}`, {
      method: 'PATCH',
      body: { name: params.name },
    });
    return { item: mapDriveItem(data) };
  },
});
