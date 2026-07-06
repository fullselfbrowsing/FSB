import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const getTask = defineTool({
  name: 'get_task',
  displayName: 'Get Task',
  description: 'Get detailed information about a specific task by its GID.',
  summary: 'Get details of a specific task',
  icon: 'square-check-big',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to retrieve'),
    opt_fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to return (defaults to standard task fields)'),
  }),
  output: z.object({
    task: taskSchema.describe('Task details'),
  }),
  handle: async params => {
    const data = await api<AsanaResponse<RawTask>>(`/tasks/${params.task_gid}`, {
      query: { opt_fields: params.opt_fields ?? TASK_OPT_FIELDS },
    });
    return { task: mapTask(data.data) };
  },
});
