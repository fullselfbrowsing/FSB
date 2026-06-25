import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const removeSharedLabel = defineTool({
  name: 'remove_shared_label',
  displayName: 'Remove Shared Label',
  description: 'Remove a shared label from all tasks across collaborative projects.',
  summary: 'Remove a shared label',
  icon: 'tags',
  group: 'Labels',
  input: z.object({
    name: z.string().describe('Name of the shared label to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the shared label was removed successfully'),
  }),
  handle: async params => {
    await apiVoid('/labels/shared/remove', {
      body: { name: params.name },
    });
    return { success: true };
  },
});
