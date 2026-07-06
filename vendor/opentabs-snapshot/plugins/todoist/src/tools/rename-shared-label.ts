import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const renameSharedLabel = defineTool({
  name: 'rename_shared_label',
  displayName: 'Rename Shared Label',
  description: 'Rename a shared label across all projects that use it.',
  summary: 'Rename a shared label',
  icon: 'tags',
  group: 'Labels',
  input: z.object({
    name: z.string().describe('Current name of the shared label'),
    new_name: z.string().describe('New name for the shared label'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the shared label was renamed successfully'),
  }),
  handle: async params => {
    await apiVoid('/labels/shared/rename', {
      body: { name: params.name, new_name: params.new_name },
    });
    return { success: true };
  },
});
