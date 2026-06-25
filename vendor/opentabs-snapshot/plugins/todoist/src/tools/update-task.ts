import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawTask, mapTask, taskSchema } from './schemas.js';

export const updateTask = defineTool({
  name: 'update_task',
  displayName: 'Update Task',
  description: 'Update an existing Todoist task. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an existing task',
  icon: 'pencil',
  group: 'Tasks',
  input: z.object({
    task_id: z.string().min(1).describe('Task ID to update'),
    content: z.string().optional().describe('New task content/title'),
    description: z.string().optional().describe('New task description in markdown'),
    labels: z.array(z.string()).optional().describe('New list of label names (replaces existing)'),
    priority: z.number().int().min(1).max(4).optional().describe('Priority from 1 (normal) to 4 (urgent)'),
    due_string: z.string().optional().describe('Human-readable due date string (e.g. "tomorrow at 3pm")'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    due_datetime: z.string().optional().describe('Due datetime in RFC3339 format'),
    assignee_id: z.string().optional().describe('User ID to assign the task to'),
    duration: z.number().optional().describe('Estimated duration amount'),
    duration_unit: z.enum(['minute', 'day']).optional().describe('Duration unit: "minute" or "day"'),
  }),
  output: z.object({
    task: taskSchema.describe('The updated task'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.content !== undefined) body.content = params.content;
    if (params.description !== undefined) body.description = params.description;
    if (params.labels !== undefined) body.labels = params.labels;
    if (params.priority !== undefined) body.priority = params.priority;
    if (params.due_string !== undefined) body.due_string = params.due_string;
    if (params.due_date !== undefined) body.due_date = params.due_date;
    if (params.due_datetime !== undefined) body.due_datetime = params.due_datetime;
    if (params.assignee_id !== undefined) body.assignee_id = params.assignee_id;
    if (params.duration !== undefined) body.duration = params.duration;
    if (params.duration_unit !== undefined) body.duration_unit = params.duration_unit;

    const data = await api<RawTask>(`/tasks/${params.task_id}`, {
      method: 'POST',
      body,
    });
    return { task: mapTask(data) };
  },
});
