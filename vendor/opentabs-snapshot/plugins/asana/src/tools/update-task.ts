import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const updateTask = defineTool({
  name: 'update_task',
  displayName: 'Update Task',
  description: 'Update an existing task — change name, completion status, assignee, dates, or notes.',
  summary: 'Update an existing task',
  icon: 'pencil',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to update'),
    name: z.string().optional().describe('New task name'),
    completed: z.boolean().optional().describe('Whether the task is completed'),
    assignee: z.string().optional().describe('New assignee user GID'),
    due_on: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    due_at: z.string().optional().describe('Due datetime in ISO 8601 format'),
    start_on: z.string().optional().describe('Start date in YYYY-MM-DD format'),
    notes: z.string().optional().describe('Plain-text task description'),
  }),
  output: z.object({
    task: taskSchema.describe('The updated task'),
  }),
  handle: async params => {
    const fields: Record<string, unknown> = {};
    if (params.name !== undefined) fields.name = params.name;
    if (params.completed !== undefined) fields.completed = params.completed;
    if (params.assignee !== undefined) fields.assignee = params.assignee;
    if (params.due_on !== undefined) fields.due_on = params.due_on;
    if (params.due_at !== undefined) fields.due_at = params.due_at;
    if (params.start_on !== undefined) fields.start_on = params.start_on;
    if (params.notes !== undefined) fields.notes = params.notes;

    const data = await api<AsanaResponse<RawTask>>(`/tasks/${params.task_gid}`, {
      method: 'PUT',
      body: { data: fields },
      query: { opt_fields: TASK_OPT_FIELDS },
    });
    return { task: mapTask(data.data) };
  },
});
