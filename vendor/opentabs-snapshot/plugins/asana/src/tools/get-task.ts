// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../asana-api.js';

export const getTask = defineTool({
  name: 'get_task',
  displayName: 'Get Task',
  description: 'Get a single task from Asana by its GID.',
  summary: 'Get a single task',
  icon: 'file',
  group: 'Tasks',
  input: z.object({
    task_gid: z.string().min(1).describe('Task GID to fetch'),
  }),
  output: z.object({
    task: z
      .object({
        gid: z.string(),
        name: z.string(),
        notes: z.string().optional(),
        completed: z.boolean().optional(),
      })
      .describe('The requested task'),
  }),
  handle: async (params: { task_gid: string }) => {
    // NEVER executed by the importer.
    // Upstream: api GET /tasks/:gid (default method GET) -> read.
    const data = await api<{ data: { gid: string; name: string } }>(`/tasks/${params.task_gid}`, {
      method: 'GET',
    });
    return { task: data.data };
  },
});
