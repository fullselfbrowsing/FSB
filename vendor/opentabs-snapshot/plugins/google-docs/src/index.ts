import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './google-docs-api.js';
import { copyDocument } from './tools/copy-document.js';
import { createComment } from './tools/create-comment.js';
import { createDocument } from './tools/create-document.js';
import { deleteComment } from './tools/delete-comment.js';
import { deleteDocument } from './tools/delete-document.js';
import { deleteReply } from './tools/delete-reply.js';
import { getCurrentDocument } from './tools/get-current-document.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getDocument } from './tools/get-document.js';
import { getDocumentText } from './tools/get-document-text.js';
import { listComments } from './tools/list-comments.js';
import { listRecentDocuments } from './tools/list-recent-documents.js';
import { reopenComment } from './tools/reopen-comment.js';
import { replyToComment } from './tools/reply-to-comment.js';
import { resolveComment } from './tools/resolve-comment.js';
import { restoreDocument } from './tools/restore-document.js';
import { searchDocuments } from './tools/search-documents.js';
import { trashDocument } from './tools/trash-document.js';
import { updateDocumentTitle } from './tools/update-document-title.js';

class GoogleDocsPlugin extends OpenTabsPlugin {
  readonly name = 'google-docs';
  readonly description = 'OpenTabs plugin for Google Docs';
  override readonly displayName = 'Google Docs';
  readonly urlPatterns = ['*://docs.google.com/document/*'];
  override readonly homepage = 'https://docs.google.com/document/';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getCurrentDocument,
    getDocument,
    getDocumentText,
    listRecentDocuments,
    searchDocuments,
    createDocument,
    copyDocument,
    updateDocumentTitle,
    trashDocument,
    restoreDocument,
    deleteDocument,
    listComments,
    createComment,
    replyToComment,
    resolveComment,
    reopenComment,
    deleteComment,
    deleteReply,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GoogleDocsPlugin();
