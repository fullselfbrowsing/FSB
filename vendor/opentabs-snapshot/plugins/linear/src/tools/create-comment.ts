// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { graphql } from '../linear-api.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Add a comment to a Linear issue. Requires the issue ID and the comment body.',
  summary: 'Comment on an issue',
  icon: 'message-circle',
  group: 'Issues',
  input: z.object({
    issueId: z.string().min(1).describe('Issue ID to comment on'),
    body: z.string().min(1).describe('Comment body in markdown'),
  }),
  output: z.object({
    comment: z
      .object({
        id: z.string(),
        body: z.string(),
      })
      .describe('The created comment'),
  }),
  handle: async (params: { issueId: string; body: string }) => {
    // NEVER executed by the importer.
    // Upstream: graphql `commentCreate` mutation (always POST) -> write.
    const data = await graphql<{ commentCreate: { comment: { id: string; body: string } } }>(
      'mutation CommentCreate($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id body } } }',
      { input: { issueId: params.issueId, body: params.body } }
    );
    return { comment: data.commentCreate.comment };
  },
});
