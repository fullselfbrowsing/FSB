// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../clickup-api.js';

export const createTask = defineTool({
  name: 'create_task',
  displayName: 'Create Task',
  description:
    'Create a new task in a ClickUp list. Requires a list_id and a name at minimum. Optionally set description, assignees, tags, status, priority, and due date.',
  summary: 'Create a new task',
  icon: 'plus',
  group: 'Tasks',
  input: z.object({
    list_id: z.string().min(1).describe('List ID to create the task in'),
    name: z.string().min(1).describe('Task name/title'),
    description: z.string().optional().describe('Task description in markdown'),
    assignees: z.array(z.number()).optional().describe('User IDs to assign the task to'),
    tags: z.array(z.string()).optional().describe('Tag names to apply to the task'),
    status: z.string().optional().describe('Status name to set on the task'),
    priority: z.number().int().min(1).max(4).optional().describe('Priority from 1 (urgent) to 4 (low)'),
    due_date: z.number().optional().describe('Due date as a Unix timestamp in milliseconds'),
    parent: z.string().optional().describe('Parent task ID to create a subtask'),
  }),
  output: z.object({
    id: z.string().describe('The created task ID'),
    name: z.string().describe('The created task name'),
    url: z.string().optional().describe('The created task URL'),
  }),
  handle: async (params: { list_id: string; name: string }) => {
    // NEVER executed by the importer. Upstream: api POST /list/:list_id/task.
    const data = await api<{ id: string; name: string }>(`/list/${params.list_id}/task`, {
      method: 'POST',
      body: { name: params.name },
    });
    return data;
  },
});
