import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawTask, type TodoistList, mapTask, taskSchema } from './schemas.js';

export const listTasks = defineTool({
  name: 'list_tasks',
  displayName: 'List Tasks',
  description: 'List tasks from Todoist. Optionally filter by project, section, or label.',
  summary: 'List tasks with optional filters',
  icon: 'list-checks',
  group: 'Tasks',
  input: z.object({
    project_id: z.string().optional().describe('Filter tasks by project ID'),
    section_id: z.string().optional().describe('Filter tasks by section ID'),
    label: z.string().optional().describe('Filter tasks by label name'),
  }),
  output: z.object({
    tasks: z.array(taskSchema).describe('List of tasks'),
  }),
  handle: async params => {
    const data = await api<TodoistList<RawTask>>('/tasks', {
      query: {
        project_id: params.project_id,
        section_id: params.section_id,
        label: params.label,
      },
    });
    return { tasks: data.results.map(mapTask) };
  },
});
