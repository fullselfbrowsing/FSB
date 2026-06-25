import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';
import { type RawPermission, mapPermission, permissionSchema } from './schemas.js';

export const listPermissions = defineTool({
  name: 'list_permissions',
  displayName: 'List Permissions',
  description: 'List sharing permissions on a file or folder.',
  summary: 'List sharing permissions',
  icon: 'shield',
  group: 'Sharing',
  input: z.object({
    item_id: z.string().describe('File or folder ID'),
  }),
  output: z.object({
    permissions: z.array(permissionSchema).describe('Sharing permissions'),
  }),
  handle: async ({ item_id }) => {
    const data = await api<{ value: RawPermission[] }>(`/me/drive/items/${item_id}/permissions`);
    return { permissions: data.value.map(mapPermission) };
  },
});
