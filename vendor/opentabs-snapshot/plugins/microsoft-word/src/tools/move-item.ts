import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const moveItem = defineTool({
  name: 'move_item',
  displayName: 'Move Item',
  description: 'Move a file or folder to a new parent folder.',
  summary: 'Move a file or folder',
  icon: 'folder-input',
  group: 'Files',
  input: z.object({
    item_id: z.string().describe('ID of the file or folder to move'),
    destination_id: z.string().describe('ID of the destination folder'),
  }),
  output: z.object({
    item: driveItemSchema.describe('The moved item'),
  }),
  handle: async params => {
    const data = await api<RawDriveItem>(`/me/drive/items/${params.item_id}`, {
      method: 'PATCH',
      body: { parentReference: { id: params.destination_id } },
    });
    return { item: mapDriveItem(data) };
  },
});
