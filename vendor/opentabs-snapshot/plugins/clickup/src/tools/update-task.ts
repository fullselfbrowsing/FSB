// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../clickup-api.js';

export const updateTask = defineTool({
  name: 'update_task',
  displayName: 'Update Task',
  description: 'Update an existing ClickUp task. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an existing task',
  icon: 'pencil',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to update'),
    name: z.string().optional().describe('New task name/title'),
    description: z.string().optional().describe('New task description in markdown'),
    status: z.string().optional().describe('New status name'),
    priority: z.number().int().min(1).max(4).optional().describe('Priority from 1 (urgent) to 4 (low)'),
    due_date: z.number().optional().describe('Due date as a Unix timestamp in milliseconds'),
    assignees_add: z.array(z.number()).optional().describe('User IDs to add as assignees'),
    assignees_rem: z.array(z.number()).optional().describe('User IDs to remove as assignees'),
  }),
  output: z.object({
    id: z.string().describe('The updated task ID'),
    name: z.string().describe('The updated task name'),
  }),
  handle: async (params: { task_id: string; name?: string }) => {
    // NEVER executed by the importer. Upstream: api PUT /task/:task_id.
    const data = await api<{ id: string; name: string }>(`/task/${params.task_id}`, {
      method: 'PUT',
      body: { name: params.name },
    });
    return data;
  },
});
