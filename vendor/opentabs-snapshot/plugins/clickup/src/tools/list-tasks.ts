// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../clickup-api.js';

export const listTasks = defineTool({
  name: 'list_tasks',
  displayName: 'List Tasks',
  description: 'List tasks in a ClickUp list. Optionally filter by assignee, status, or archived state.',
  summary: 'List tasks in a list',
  icon: 'list-checks',
  group: 'Tasks',
  input: z.object({
    list_id: z.string().min(1).describe('List ID to fetch tasks from'),
    assignees: z.array(z.number()).optional().describe('Filter tasks by assignee user IDs'),
    statuses: z.array(z.string()).optional().describe('Filter tasks by status names'),
    archived: z.boolean().optional().describe('Include archived tasks'),
    page: z.number().int().optional().describe('Page number for pagination (0-indexed)'),
  }),
  output: z.object({
    tasks: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .describe('List of tasks'),
  }),
  handle: async (params: { list_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /list/:list_id/task (default method).
    const data = await api<{ tasks: Array<{ id: string; name: string }> }>(`/list/${params.list_id}/task`);
    return data;
  },
});
