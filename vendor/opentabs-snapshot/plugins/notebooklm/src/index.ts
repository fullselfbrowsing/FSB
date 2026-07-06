import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './notebooklm-api.js';
import { listNotebooks } from './tools/list-notebooks.js';
import { getNotebook } from './tools/get-notebook.js';
import { createNotebook } from './tools/create-notebook.js';
import { deleteNotebook } from './tools/delete-notebook.js';
import { renameNotebook } from './tools/rename-notebook.js';
import { copyNotebook } from './tools/copy-notebook.js';
import { getProjectDetails } from './tools/get-project-details.js';
import { navigateToNotebook } from './tools/navigate-to-notebook.js';
import { getNotes } from './tools/get-notes.js';
import { createNote } from './tools/create-note.js';
import { updateNote } from './tools/update-note.js';
import { deleteNotes } from './tools/delete-notes.js';
import { listChatSessions } from './tools/list-chat-sessions.js';
import { getNotebookGuide } from './tools/get-notebook-guide.js';
import { addSourceUrl } from './tools/add-source-url.js';
import { addSourceText } from './tools/add-source-text.js';
import { listSources } from './tools/list-sources.js';
import { deleteSources } from './tools/delete-sources.js';
import { getCurrentUser } from './tools/get-current-user.js';

class NotebookLMPlugin extends OpenTabsPlugin {
  readonly name = 'notebooklm';
  readonly description = 'OpenTabs plugin for Google NotebookLM';
  override readonly displayName = 'NotebookLM';
  readonly urlPatterns = ['*://notebooklm.google.com/*'];
  override readonly homepage = 'https://notebooklm.google.com';

  readonly tools: ToolDefinition[] = [
    listNotebooks,
    getNotebook,
    createNotebook,
    deleteNotebook,
    renameNotebook,
    copyNotebook,
    getProjectDetails,
    navigateToNotebook,
    getNotes,
    createNote,
    updateNote,
    deleteNotes,
    listChatSessions,
    getNotebookGuide,
    addSourceUrl,
    addSourceText,
    listSources,
    deleteSources,
    getCurrentUser,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new NotebookLMPlugin();
