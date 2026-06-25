import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';

export const deleteSchedule = defineTool({
  name: 'delete_schedule',
  displayName: 'Delete Schedule',
  description: 'Delete a scheduled pipeline trigger. This action cannot be undone.',
  summary: 'Delete a scheduled trigger',
  icon: 'trash-2',
  group: 'Schedules',
  input: z.object({
    schedule_id: z.string().describe('Schedule UUID'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async ({ schedule_id }) => {
    await api(`/schedule/${schedule_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
