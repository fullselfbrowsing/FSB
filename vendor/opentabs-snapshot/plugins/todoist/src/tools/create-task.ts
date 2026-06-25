import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawTask, mapTask, taskSchema } from './schemas.js';

export const createTask = defineTool({
  name: 'create_task',
  displayName: 'Create Task',
  description:
    'Create a new task in Todoist. Requires content (title) at minimum. Optionally set project, section, parent, labels, priority, due date, assignee, and duration.',
  summary: 'Create a new task',
  icon: 'plus',
  group: 'Tasks',
  input: z.object({
    content: z.string().min(1).describe('Task content/title'),
    description: z.string().optional().describe('Task description in markdown'),
    project_id: z.string().optional().describe('Project ID to create the task in'),
    section_id: z.string().optional().describe('Section ID within the project'),
    parent_id: z.string().optional().describe('Parent task ID to create a subtask'),
    labels: z.array(z.string()).optional().describe('List of label names to apply'),
    priority: z.number().int().min(1).max(4).optional().describe('Priority from 1 (normal) to 4 (urgent)'),
    due_string: z.string().optional().describe('Human-readable due date string (e.g. "tomorrow at 3pm")'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    due_datetime: z.string().optional().describe('Due datetime in RFC3339 format'),
    assignee_id: z.string().optional().describe('User ID to assign the task to'),
    duration: z.number().optional().describe('Estimated duration amount'),
    duration_unit: z.enum(['minute', 'day']).optional().describe('Duration unit: "minute" or "day"'),
  }),
  output: z.object({
    task: taskSchema.describe('The created task'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = { content: params.content };
    if (params.description !== undefined) body.description = params.description;
    if (params.project_id !== undefined) body.project_id = params.project_id;
    if (params.section_id !== undefined) body.section_id = params.section_id;
    if (params.parent_id !== undefined) body.parent_id = params.parent_id;
    if (params.labels !== undefined) body.labels = params.labels;
    if (params.priority !== undefined) body.priority = params.priority;
    if (params.due_string !== undefined) body.due_string = params.due_string;
    if (params.due_date !== undefined) body.due_date = params.due_date;
    if (params.due_datetime !== undefined) body.due_datetime = params.due_datetime;
    if (params.assignee_id !== undefined) body.assignee_id = params.assignee_id;
    if (params.duration !== undefined) body.duration = params.duration;
    if (params.duration_unit !== undefined) body.duration_unit = params.duration_unit;

    const data = await api<RawTask>('/tasks', {
      method: 'POST',
      body,
    });
    return { task: mapTask(data) };
  },
});
