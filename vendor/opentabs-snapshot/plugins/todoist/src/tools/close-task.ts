// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const closeTask = defineTool({
  name: 'close_task',
  displayName: 'Close Task',
  description: 'Close (complete) a Todoist task by its ID. The task is marked as done.',
  summary: 'Complete a task',
  icon: 'circle-check',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to close'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the task was successfully closed'),
  }),
  handle: async (params: { task_id: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid POST /tasks/:id/close (write).
    await apiVoid(`/tasks/${params.task_id}/close`);
    return { success: true };
  },
});
