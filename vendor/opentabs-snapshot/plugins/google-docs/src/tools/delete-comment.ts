import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApiVoid, resolveDocumentId } from '../google-docs-api.js';

export const deleteComment = defineTool({
  name: 'delete_comment',
  displayName: 'Delete Comment',
  description:
    'Permanently delete a comment thread from a Google Doc. Only the comment author or the document owner can delete comments. This action cannot be undone.',
  summary: 'Delete a comment thread',
  icon: 'trash-2',
  group: 'Comments',
  input: z.object({
    document_id: z
      .string()
      .optional()
      .describe('Google Docs document ID. Defaults to the document open in the current editor tab.'),
    comment_id: z.string().describe('Comment thread ID to delete (from list_comments)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the delete operation completed'),
  }),
  handle: async params => {
    const documentId = resolveDocumentId(params.document_id);

    await driveApiVoid(`/files/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(params.comment_id)}`, {
      method: 'DELETE',
    });

    return { success: true };
  },
});
