import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

export const listSharedWithMe = defineTool({
  name: 'list_shared_with_me',
  displayName: 'List Shared With Me',
  description: 'List files and folders shared with the current user.',
  summary: 'List files shared with me',
  icon: 'users',
  group: 'Files',
  input: z.object({
    top: z.number().int().min(1).max(50).optional().describe('Max results (default 10, max 50)'),
  }),
  output: z.object({
    items: z.array(driveItemSchema).describe('Shared files and folders'),
  }),
  handle: async ({ top }) => {
    const data = await api<{ value: RawDriveItem[] }>('/me/drive/sharedWithMe', {
      query: {
        $top: top ?? 10,
        $select: 'id,name,size,folder,file,webUrl,createdDateTime,lastModifiedDateTime,parentReference,description',
      },
    });
    return { items: data.value.map(mapDriveItem) };
  },
});
