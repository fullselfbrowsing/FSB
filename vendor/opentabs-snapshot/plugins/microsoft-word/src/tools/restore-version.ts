import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';

export const restoreVersion = defineTool({
  name: 'restore_version',
  displayName: 'Restore Version',
  description: 'Restore a file to a previous version.',
  summary: 'Restore a file version',
  icon: 'rotate-ccw',
  group: 'Versions',
  input: z.object({
    item_id: z.string().describe('File ID'),
    version_id: z.string().describe('Version ID to restore'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the version was restored'),
  }),
  handle: async ({ item_id, version_id }) => {
    await api(`/me/drive/items/${item_id}/versions/${version_id}/restoreVersion`, { method: 'POST' });
    return { success: true };
  },
});
