import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi, resolveDocumentId } from '../google-docs-api.js';
import { COMMENT_FIELDS, commentSchema, mapComment, type RawComment, type RawReply } from './schemas.js';

const REPLY_FIELDS = 'id,action';

export const reopenComment = defineTool({
  name: 'reopen_comment',
  displayName: 'Reopen Comment',
  description:
    'Reopen a previously resolved comment thread. In the Drive API, reopening is done by creating a reply with action "reopen".',
  summary: 'Reopen a resolved comment thread',
  icon: 'rotate-ccw',
  group: 'Comments',
  input: z.object({
    document_id: z
      .string()
      .optional()
      .describe('Google Docs document ID. Defaults to the document open in the current editor tab.'),
    comment_id: z.string().describe('Comment thread ID to reopen (from list_comments)'),
  }),
  output: z.object({
    comment: commentSchema,
  }),
  handle: async params => {
    const documentId = resolveDocumentId(params.document_id);
    const encodedDocId = encodeURIComponent(documentId);
    const encodedCommentId = encodeURIComponent(params.comment_id);

    await driveApi<RawReply>(`/files/${encodedDocId}/comments/${encodedCommentId}/replies`, {
      method: 'POST',
      params: { fields: REPLY_FIELDS },
      body: { content: '', action: 'reopen' },
    });

    const comment = await driveApi<RawComment>(`/files/${encodedDocId}/comments/${encodedCommentId}`, {
      params: { fields: COMMENT_FIELDS },
    });

    return { comment: mapComment(comment) };
  },
});
