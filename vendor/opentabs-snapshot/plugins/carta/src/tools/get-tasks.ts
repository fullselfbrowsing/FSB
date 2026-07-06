import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../carta-api.js';
import { taskSchema } from './schemas.js';

interface TasksResponse {
  count: number;
  tasks: Array<Record<string, unknown>>;
}

export const getTasks = defineTool({
  name: 'get_tasks',
  displayName: 'Get Tasks',
  description:
    'Get pending tasks that require action, such as signing documents, accepting grants, or completing forms.',
  summary: 'Get pending action items',
  icon: 'check-square',
  group: 'Tasks',
  input: z.object({}),
  output: z.object({ result: taskSchema }),
  handle: async () => {
    const data = await api<TasksResponse>('/api/tasks/');
    return {
      result: {
        count: data.count,
        tasks: data.tasks,
      },
    };
  },
});
