import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const searchTasks = defineTool({
  name: 'search_tasks',
  displayName: 'Search Tasks',
  description:
    'Search for tasks in a workspace. Supports filtering by text, assignee, completion status, due dates, and projects.',
  summary: 'Search tasks in a workspace',
  icon: 'search',
  group: 'Tasks',
  input: z.object({
    workspace_gid: z.string().min(1).describe('Workspace GID to search in'),
    text: z.string().optional().describe('Text to search for in task names and descriptions'),
    assignee_gid: z.string().optional().describe('Filter by assignee user GID'),
    completed: z.boolean().optional().describe('Filter by completion status'),
    due_on_before: z.string().optional().describe('Filter tasks due on or before this date (YYYY-MM-DD)'),
    due_on_after: z.string().optional().describe('Filter tasks due on or after this date (YYYY-MM-DD)'),
    projects_any: z.string().optional().describe('Comma-separated project GIDs to filter by (matches any)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (default 20, max 100)'),
  }),
  output: z.object({
    tasks: z.array(taskSchema).describe('List of matching tasks'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      opt_fields: TASK_OPT_FIELDS,
      limit: params.limit ?? 20,
    };
    if (params.text !== undefined) query.text = params.text;
    if (params.assignee_gid !== undefined) query['assignee.any'] = params.assignee_gid;
    if (params.completed !== undefined) query.completed = params.completed;
    if (params.due_on_before !== undefined) query['due_on.before'] = params.due_on_before;
    if (params.due_on_after !== undefined) query['due_on.after'] = params.due_on_after;
    if (params.projects_any !== undefined) query['projects.any'] = params.projects_any;

    const data = await api<AsanaList<RawTask>>(`/workspaces/${params.workspace_gid}/tasks/search`, { query });
    return { tasks: (data.data ?? []).map(mapTask) };
  },
});
