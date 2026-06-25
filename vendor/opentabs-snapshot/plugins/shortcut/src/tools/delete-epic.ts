import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';

export const deleteEpic = defineTool({
  name: 'delete_epic',
  displayName: 'Delete Epic',
  description: 'Permanently delete an epic by its numeric ID. This action cannot be undone.',
  summary: 'Delete an epic',
  icon: 'trash-2',
  group: 'Epics',
  input: z.object({
    epic_id: z.number().int().describe('Epic numeric ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api(`/epics/${params.epic_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
