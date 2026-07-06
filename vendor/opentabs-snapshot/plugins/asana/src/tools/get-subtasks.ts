import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const getSubtasks = defineTool({
  name: 'get_subtasks',
  displayName: 'Get Subtasks',
  description: 'List subtasks of a parent task. Supports pagination with limit and offset.',
  summary: 'List subtasks of a task',
  icon: 'list-tree',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Parent task GID to list subtasks for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of subtasks to return (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset from a previous response'),
  }),
  output: z.object({
    subtasks: z.array(taskSchema).describe('List of subtasks'),
    next_page: z.string().nullable().describe('Pagination offset for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawTask>>(`/tasks/${params.task_gid}/subtasks`, {
      query: {
        opt_fields: TASK_OPT_FIELDS,
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      subtasks: (data.data ?? []).map(mapTask),
      next_page: data.next_page?.offset ?? null,
    };
  },
});
