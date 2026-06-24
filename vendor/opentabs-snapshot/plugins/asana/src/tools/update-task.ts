// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../asana-api.js';

export const updateTask = defineTool({
  name: 'update_task',
  displayName: 'Update Task',
  description: 'Update an existing Asana task. Provide the task GID and any fields to change.',
  summary: 'Update a task',
  icon: 'pencil',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to update'),
    name: z.string().optional().describe('New task name'),
    notes: z.string().optional().describe('New task notes/description'),
    assignee: z.string().optional().describe('User ID to reassign the task to'),
    completed: z.boolean().optional().describe('Mark the task completed or not'),
    due_on: z.string().optional().describe('New due date in YYYY-MM-DD format'),
  }),
  output: z.object({
    task: z
      .object({
        gid: z.string(),
        name: z.string(),
      })
      .describe('The updated task'),
  }),
  handle: async (params: { task_gid: string }) => {
    // NEVER executed by the importer.
    // Upstream: api PUT /tasks/:gid (the {method:'PUT'} literal) -> write.
    const data = await api<{ data: { gid: string; name: string } }>(`/tasks/${params.task_gid}`, {
      method: 'PUT',
      body: { data: {} },
    });
    return { task: data.data };
  },
});
