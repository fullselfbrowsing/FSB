import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { buildAdfText, commentSchema, mapComment } from './schemas.js';

export const addComment = defineTool({
  name: 'add_comment',
  displayName: 'Add Comment',
  description: 'Add a comment to a Jira issue.',
  summary: 'Add a comment to an issue',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
    body: z.string().describe('Comment text in plain text'),
  }),
  output: z.object({
    comment: commentSchema.describe('The created comment'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/issue/${encodeURIComponent(params.issue_key)}/comment`, {
      method: 'POST',
      body: { body: buildAdfText(params.body) },
    });
    return { comment: mapComment(data) };
  },
});
