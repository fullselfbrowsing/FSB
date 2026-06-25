// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../clickup-api.js';

export const getTask = defineTool({
  name: 'get_task',
  displayName: 'Get Task',
  description: 'Get detailed information about a specific ClickUp task by its ID.',
  summary: 'Get a task by ID',
  icon: 'square-check-big',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to retrieve'),
    include_subtasks: z.boolean().optional().describe('Include subtasks in the response'),
  }),
  output: z.object({
    id: z.string().describe('Task ID'),
    name: z.string().describe('Task name'),
    status: z.string().optional().describe('Task status'),
  }),
  handle: async (params: { task_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /task/:task_id (default method).
    const data = await api<{ id: string; name: string }>(`/task/${params.task_id}`);
    return data;
  },
});
