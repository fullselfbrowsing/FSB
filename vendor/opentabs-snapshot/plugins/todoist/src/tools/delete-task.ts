import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const deleteTask = defineTool({
  name: 'delete_task',
  displayName: 'Delete Task',
  description: 'Permanently delete a Todoist task by its ID. This action cannot be undone.',
  summary: 'Delete a task permanently',
  icon: 'trash-2',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the task was successfully deleted'),
  }),
  handle: async params => {
    await apiVoid(`/tasks/${params.task_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
