// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawTask, mapTask, taskSchema } from './schemas.js';

export const getTask = defineTool({
  name: 'get_task',
  displayName: 'Get Task',
  description: 'Get detailed information about a specific Todoist task by its ID.',
  summary: 'Get a task by ID',
  icon: 'square-check-big',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to retrieve'),
  }),
  output: z.object({
    task: taskSchema.describe('Task details'),
  }),
  handle: async (params: { task_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /tasks/:id (default method).
    const data = await api<RawTask>(`/tasks/${params.task_id}`);
    return { task: mapTask(data) };
  },
});
