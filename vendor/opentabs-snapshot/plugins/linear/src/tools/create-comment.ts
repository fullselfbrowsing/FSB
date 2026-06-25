import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { commentSchema, mapComment } from './schemas.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Add a comment to an existing Linear issue.',
  summary: 'Add a comment to an issue',
  icon: 'message-square-plus',
  group: 'Comments',
  input: z.object({
    issue_id: z.string().describe('Issue UUID to comment on'),
    body: z.string().describe('Comment body in markdown'),
  }),
  output: z.object({
    comment: commentSchema.describe('The newly created comment'),
  }),
  handle: async params => {
    const data = await graphql<{
      commentCreate: {
        success: boolean;
        comment: Record<string, unknown>;
      };
    }>(
      `mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id body createdAt updatedAt editedAt
            user { name displayName }
          }
        }
      }`,
      { input: { issueId: params.issue_id, body: params.body } },
    );

    if (!data.commentCreate?.comment) throw ToolError.internal('Comment creation failed — no comment returned');

    return { comment: mapComment(data.commentCreate.comment as Parameters<typeof mapComment>[0]) };
  },
});
