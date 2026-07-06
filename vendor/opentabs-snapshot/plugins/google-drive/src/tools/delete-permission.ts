import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../google-drive-api.js';

export const deletePermission = defineTool({
  name: 'delete_permission',
  displayName: 'Remove Sharing',
  description: 'Remove a sharing permission from a file or folder. Use list_permissions to find permission IDs.',
  summary: 'Remove sharing access from a file',
  icon: 'user-minus',
  group: 'Sharing',
  input: z.object({
    file_id: z.string().describe('File or folder ID'),
    permission_id: z.string().describe('Permission ID to remove (from list_permissions)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await apiVoid(
      `/files/${encodeURIComponent(params.file_id)}/permissions/${encodeURIComponent(params.permission_id)}`,
      { method: 'DELETE' },
    );
    return { success: true };
  },
});
