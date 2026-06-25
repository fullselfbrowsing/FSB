import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const getTasksForSection = defineTool({
  name: 'get_tasks_for_section',
  displayName: 'Get Tasks for Section',
  description: 'List tasks in a project section. Supports pagination with limit and offset.',
  summary: 'List tasks in a section',
  icon: 'list',
  group: 'Tasks',
  input: z.object({
    section_gid: z.string().min(1).describe('Section GID to list tasks for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of tasks to return (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset from a previous response'),
  }),
  output: z.object({
    tasks: z.array(taskSchema).describe('List of tasks in the section'),
    next_page: z.string().nullable().describe('Pagination offset for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawTask>>(`/sections/${params.section_gid}/tasks`, {
      query: {
        opt_fields: TASK_OPT_FIELDS,
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      tasks: (data.data ?? []).map(mapTask),
      next_page: data.next_page?.offset ?? null,
    };
  },
});
