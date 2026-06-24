// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../asana-api.js';

export const createTask = defineTool({
  name: 'create_task',
  displayName: 'Create Task',
  description:
    'Create a new task in Asana. Requires a name at minimum. Optionally set notes, assignee, projects, due date, and parent task.',
  summary: 'Create a new task',
  icon: 'plus',
  group: 'Tasks',
  input: z.object({
    name: z.string().min(1).describe('Task name/title'),
    notes: z.string().optional().describe('Task notes/description'),
    assignee: z.string().optional().describe('User ID to assign the task to'),
    projects: z.array(z.string()).optional().describe('List of project IDs to add the task to'),
    workspace: z.string().optional().describe('Workspace ID the task belongs to'),
    due_on: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    parent: z.string().optional().describe('Parent task ID to create a subtask'),
  }),
  output: z.object({
    task: z
      .object({
        gid: z.string(),
        name: z.string(),
        permalink_url: z.string().optional(),
      })
      .describe('The created task'),
  }),
  handle: async (params: { name: string }) => {
    // NEVER executed by the importer (metadata-only read).
    // Upstream: api POST /tasks (the {method:'POST'} literal) -> write.
    const data = await api<{ data: { gid: string; name: string } }>('/tasks', {
      method: 'POST',
      body: { data: { name: params.name } },
    });
    return { task: data.data };
  },
});
