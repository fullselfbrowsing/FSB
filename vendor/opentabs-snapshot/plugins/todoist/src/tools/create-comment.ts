import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Add a comment to a task or project. Provide either task_id or project_id.',
  summary: 'Add a comment to a task or project',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    content: z.string().describe('Comment content in markdown'),
    task_id: z.string().optional().describe('Task ID to add the comment to'),
    project_id: z.string().optional().describe('Project ID to add the comment to'),
  }),
  output: z.object({
    comment: commentSchema.describe('The newly created comment'),
  }),
  handle: async params => {
    const body: Record<string, string> = { content: params.content };
    if (params.task_id) body.task_id = params.task_id;
    if (params.project_id) body.project_id = params.project_id;

    const data = await api<RawComment>('/comments', {
      method: 'POST',
      body,
    });
    return { comment: mapComment(data) };
  },
});
