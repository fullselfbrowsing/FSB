import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi, resolveDocumentId } from '../google-docs-api.js';
import { COMMENT_FIELDS, commentSchema, mapComment, type RawComment } from './schemas.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description:
    'Add a new comment to a Google Doc. Optionally anchor the comment to specific quoted text in the document. If quoted_text is provided, the comment appears as a margin note next to that text.',
  summary: 'Add a comment to a document',
  icon: 'message-square-plus',
  group: 'Comments',
  input: z.object({
    document_id: z
      .string()
      .optional()
      .describe('Google Docs document ID. Defaults to the document open in the current editor tab.'),
    content: z.string().min(1).describe('Comment text content'),
    quoted_text: z
      .string()
      .optional()
      .describe('Document text to anchor the comment to. The comment appears next to this text in the margin.'),
  }),
  output: z.object({
    comment: commentSchema,
  }),
  handle: async params => {
    const documentId = resolveDocumentId(params.document_id);

    const body: Record<string, unknown> = { content: params.content };
    if (params.quoted_text) {
      body.quotedFileContent = { mimeType: 'text/plain', value: params.quoted_text };
    }

    const comment = await driveApi<RawComment>(`/files/${encodeURIComponent(documentId)}/comments`, {
      method: 'POST',
      params: { fields: COMMENT_FIELDS },
      body,
    });

    return { comment: mapComment(comment) };
  },
});
