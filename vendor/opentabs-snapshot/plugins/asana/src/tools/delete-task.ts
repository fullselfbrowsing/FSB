import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';

export const deleteTask = defineTool({
  name: 'delete_task',
  displayName: 'Delete Task',
  description: 'Permanently delete a task by its GID. This action cannot be undone.',
  summary: 'Delete a task permanently',
  icon: 'trash-2',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the task was successfully deleted'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>(`/tasks/${params.task_gid}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
