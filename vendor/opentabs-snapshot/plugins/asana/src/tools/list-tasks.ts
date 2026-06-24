// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../asana-api.js';

export const listTasks = defineTool({
  name: 'list_tasks',
  displayName: 'List Tasks',
  description: 'List tasks from Asana. Optionally filter by project, assignee, or workspace.',
  summary: 'List tasks with optional filters',
  icon: 'list',
  group: 'Tasks',
  input: z.object({
    project: z.string().optional().describe('Filter tasks by project ID'),
    assignee: z.string().optional().describe('Filter tasks by assignee user ID'),
    workspace: z.string().optional().describe('Workspace ID to scope the listing'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of tasks to return'),
  }),
  output: z.object({
    tasks: z
      .array(
        z.object({
          gid: z.string(),
          name: z.string(),
        })
      )
      .describe('List of tasks'),
  }),
  handle: async (params: { project?: string; assignee?: string; workspace?: string }) => {
    // NEVER executed by the importer.
    // Upstream: api GET /tasks (default method GET) -> read.
    const data = await api<{ data: Array<{ gid: string; name: string }> }>('/tasks', {
      method: 'GET',
      query: { project: params.project, assignee: params.assignee, workspace: params.workspace },
    });
    return { tasks: data.data };
  },
});
