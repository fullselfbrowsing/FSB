import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const getItem = defineTool({
  name: 'get_item',
  displayName: 'Get Item',
  description: 'Get metadata for a file or folder by its ID.',
  summary: 'Get file or folder details',
  icon: 'file',
  group: 'Files',
  input: z.object({
    item_id: z.string().describe('File or folder ID'),
  }),
  output: z.object({ item: driveItemSchema }),
  handle: async params => {
    const data = await api<RawDriveItem>(`/me/drive/items/${params.item_id}`, {
      query: {
        $select: 'id,name,folder,file,size,lastModifiedDateTime,webUrl,parentReference,createdDateTime,description',
      },
    });
    return { item: mapDriveItem(data) };
  },
});
