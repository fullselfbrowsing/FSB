import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi, resolveDocumentId } from '../google-docs-api.js';
import { mapReply, replySchema, type RawReply } from './schemas.js';

const REPLY_FIELDS = 'id,author(displayName,emailAddress,photoLink),content,createdTime,modifiedTime,action';

export const replyToComment = defineTool({
  name: 'reply_to_comment',
  displayName: 'Reply to Comment',
  description: 'Add a reply to an existing comment thread on a Google Doc.',
  summary: 'Reply to a comment thread',
  icon: 'reply',
  group: 'Comments',
  input: z.object({
    document_id: z
      .string()
      .optional()
      .describe('Google Docs document ID. Defaults to the document open in the current editor tab.'),
    comment_id: z.string().describe('Comment thread ID to reply to (from list_comments)'),
    content: z.string().min(1).describe('Reply text content'),
  }),
  output: z.object({
    reply: replySchema,
  }),
  handle: async params => {
    const documentId = resolveDocumentId(params.document_id);

    const reply = await driveApi<RawReply>(
      `/files/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(params.comment_id)}/replies`,
      {
        method: 'POST',
        params: { fields: REPLY_FIELDS },
        body: { content: params.content, action: 'reopen' },
      },
    );

    return { reply: mapReply(reply) };
  },
});
