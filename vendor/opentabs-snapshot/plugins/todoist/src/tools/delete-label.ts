import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const deleteLabel = defineTool({
  name: 'delete_label',
  displayName: 'Delete Label',
  description: 'Permanently delete a label. This action cannot be undone.',
  summary: 'Delete a label',
  icon: 'tag',
  group: 'Labels',
  input: z.object({
    label_id: z.string().describe('The ID of the label to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the label was deleted successfully'),
  }),
  handle: async params => {
    await apiVoid(`/labels/${params.label_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
