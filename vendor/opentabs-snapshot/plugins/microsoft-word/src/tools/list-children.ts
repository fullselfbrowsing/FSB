import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawDriveItem, driveItemSchema, mapDriveItem } from './schemas.js';

const SELECT_FIELDS =
  'id,name,folder,file,size,lastModifiedDateTime,webUrl,parentReference,createdDateTime,description';

export const listChildren = defineTool({
  name: 'list_children',
  displayName: 'List Children',
  description: 'List files and folders in a directory. Use item_id to specify the folder, or omit for root.',
  summary: 'List files and folders',
  icon: 'folder-open',
  group: 'Files',
  input: z.object({
    item_id: z.string().optional().describe('Folder ID — omit for drive root'),
    top: z.number().int().min(1).max(200).optional().describe('Max results (default 20, max 200)'),
    order_by: z.string().optional().describe('Sort field (e.g., "name asc", "lastModifiedDateTime desc")'),
  }),
  output: z.object({
    items: z.array(driveItemSchema).describe('Files and folders'),
  }),
  handle: async params => {
    const base = params.item_id ? `/me/drive/items/${params.item_id}/children` : '/me/drive/root/children';

    const data = await api<{ value: RawDriveItem[] }>(base, {
      query: {
        $top: params.top ?? 20,
        $select: SELECT_FIELDS,
        $orderby: params.order_by,
      },
    });
    return { items: (data.value ?? []).map(mapDriveItem) };
  },
});
