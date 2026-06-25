import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../microsoft-word-api.js';

export const deleteItem = defineTool({
  name: 'delete_item',
  displayName: 'Delete Item',
  description: 'Permanently delete a file or folder. This action cannot be undone.',
  summary: 'Delete a file or folder',
  icon: 'trash-2',
  group: 'Files',
  input: z.object({
    item_id: z.string().describe('ID of the file or folder to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api(`/me/drive/items/${params.item_id}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
