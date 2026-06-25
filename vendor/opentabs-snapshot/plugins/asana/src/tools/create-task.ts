import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const createTask = defineTool({
  name: 'create_task',
  displayName: 'Create Task',
  description: 'Create a new task in a workspace. Optionally assign to a project, user, or parent task.',
  summary: 'Create a new task',
  icon: 'plus',
  group: 'Tasks',
  input: z.object({
    name: z.string().min(1).describe('Task name'),
    workspace: z.string().min(1).describe('Workspace GID to create the task in'),
    projects: z.array(z.string()).optional().describe('Project GIDs to add the task to'),
    assignee: z.string().optional().describe('Assignee user GID'),
    due_on: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    due_at: z.string().optional().describe('Due datetime in ISO 8601 format'),
    start_on: z.string().optional().describe('Start date in YYYY-MM-DD format'),
    notes: z.string().optional().describe('Plain-text task description'),
    parent: z.string().optional().describe('Parent task GID to create as a subtask'),
  }),
  output: z.object({
    task: taskSchema.describe('The created task'),
  }),
  handle: async params => {
    const fields: Record<string, unknown> = {
      name: params.name,
      workspace: params.workspace,
    };
    if (params.projects !== undefined) fields.projects = params.projects;
    if (params.assignee !== undefined) fields.assignee = params.assignee;
    if (params.due_on !== undefined) fields.due_on = params.due_on;
    if (params.due_at !== undefined) fields.due_at = params.due_at;
    if (params.start_on !== undefined) fields.start_on = params.start_on;
    if (params.notes !== undefined) fields.notes = params.notes;
    if (params.parent !== undefined) fields.parent = params.parent;

    const data = await api<AsanaResponse<RawTask>>('/tasks', {
      method: 'POST',
      body: { data: fields },
      query: { opt_fields: TASK_OPT_FIELDS },
    });
    return { task: mapTask(data.data) };
  },
});
