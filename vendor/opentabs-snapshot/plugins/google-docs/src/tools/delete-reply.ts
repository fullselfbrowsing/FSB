import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApiVoid, resolveDocumentId } from '../google-docs-api.js';

export const deleteReply = defineTool({
  name: 'delete_reply',
  displayName: 'Delete Reply',
  description:
    'Permanently delete a reply from a comment thread on a Google Doc. Only the reply author or the document owner can delete replies. This action cannot be undone.',
  summary: 'Delete a reply from a comment thread',
  icon: 'trash-2',
  group: 'Comments',
  input: z.object({
    document_id: z
      .string()
      .optional()
      .describe('Google Docs document ID. Defaults to the document open in the current editor tab.'),
    comment_id: z.string().describe('Comment thread ID containing the reply (from list_comments)'),
    reply_id: z.string().describe('Reply ID to delete (from list_comments replies array)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the delete operation completed'),
  }),
  handle: async params => {
    const documentId = resolveDocumentId(params.document_id);

    await driveApiVoid(
      `/files/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(params.comment_id)}/replies/${encodeURIComponent(params.reply_id)}`,
      { method: 'DELETE' },
    );

    return { success: true };
  },
});
