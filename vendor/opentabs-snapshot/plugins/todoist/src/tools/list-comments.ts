import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawComment, type TodoistList, commentSchema, mapComment } from './schemas.js';

export const listComments = defineTool({
  name: 'list_comments',
  displayName: 'List Comments',
  description: 'List comments on a task or project. Provide either task_id or project_id.',
  summary: 'List comments on a task or project',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    task_id: z.string().optional().describe('Task ID to list comments for'),
    project_id: z.string().optional().describe('Project ID to list comments for'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('List of comments'),
  }),
  handle: async params => {
    const data = await api<TodoistList<RawComment>>('/comments', {
      query: { task_id: params.task_id, project_id: params.project_id },
    });
    return { comments: data.results.map(mapComment) };
  },
});
