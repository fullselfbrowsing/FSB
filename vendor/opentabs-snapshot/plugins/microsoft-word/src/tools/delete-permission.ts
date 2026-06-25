import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';

export const deletePermission = defineTool({
  name: 'delete_permission',
  displayName: 'Delete Permission',
  description: 'Remove a sharing permission from a file or folder.',
  summary: 'Remove a sharing permission',
  icon: 'shield-x',
  group: 'Sharing',
  input: z.object({
    item_id: z.string().describe('File or folder ID'),
    permission_id: z.string().describe('Permission ID to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the permission was removed'),
  }),
  handle: async ({ item_id, permission_id }) => {
    await api(`/me/drive/items/${item_id}/permissions/${permission_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
