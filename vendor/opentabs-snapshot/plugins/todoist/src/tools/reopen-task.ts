import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const reopenTask = defineTool({
  name: 'reopen_task',
  displayName: 'Reopen Task',
  description: 'Reopen a previously completed Todoist task by its ID.',
  summary: 'Reopen a completed task',
  icon: 'rotate-ccw',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to reopen'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the task was successfully reopened'),
  }),
  handle: async params => {
    await apiVoid(`/tasks/${params.task_id}/reopen`);
    return { success: true };
  },
});
