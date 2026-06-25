// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const addComment = defineTool({
  name: 'add_comment',
  displayName: 'Add Comment',
  description: 'Add a comment to an existing Jira issue.',
  summary: 'Add a comment to an issue',
  icon: 'message-square',
  group: 'Issues',
  input: z.object({
    issue_id_or_key: z.string().min(1).describe('Issue ID or key to comment on (e.g. ENG-123)'),
    body: z.string().min(1).describe('Comment body text in markdown'),
  }),
  output: z.object({
    id: z.string().describe('The created comment ID'),
    self: z.string().optional().describe('The created comment API URL'),
  }),
  handle: async (params: { issue_id_or_key: string; body: string }) => {
    // NEVER executed by the importer. Upstream: api POST /rest/api/3/issue/:idOrKey/comment (write).
    const data = await api<{ id: string }>(`/rest/api/3/issue/${params.issue_id_or_key}/comment`, {
      method: 'POST',
      body: { body: params.body },
    });
    return data;
  },
});
