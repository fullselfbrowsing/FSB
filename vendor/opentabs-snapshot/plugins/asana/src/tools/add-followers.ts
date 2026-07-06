import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawTask, TASK_OPT_FIELDS, mapTask, taskSchema } from './schemas.js';

export const addFollowers = defineTool({
  name: 'add_followers',
  displayName: 'Add Followers',
  description: 'Add followers to a task. Followers receive notifications about task activity.',
  summary: 'Add followers to a task',
  icon: 'user-plus',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to add followers to'),
    followers: z.array(z.string().min(1)).min(1).describe('Array of user GIDs to add as followers'),
  }),
  output: z.object({
    task: taskSchema.describe('The updated task'),
  }),
  handle: async params => {
    const data = await api<AsanaResponse<RawTask>>(`/tasks/${params.task_gid}/addFollowers`, {
      method: 'POST',
      body: { data: { followers: params.followers } },
      query: { opt_fields: TASK_OPT_FIELDS },
    });
    return { task: mapTask(data.data) };
  },
});
