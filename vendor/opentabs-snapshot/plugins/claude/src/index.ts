import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './claude-api.js';
import { createConversation } from './tools/create-conversation.js';
import { createProject } from './tools/create-project.js';
import { deleteConversation } from './tools/delete-conversation.js';
import { deleteProject } from './tools/delete-project.js';
import { getConversation } from './tools/get-conversation.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getProject } from './tools/get-project.js';
import { listConversations } from './tools/list-conversations.js';
import { listModels } from './tools/list-models.js';
import { listOrganizations } from './tools/list-organizations.js';
import { listProjects } from './tools/list-projects.js';
import { sendMessage } from './tools/send-message.js';
import { updateConversation } from './tools/update-conversation.js';
import { updateProject } from './tools/update-project.js';

class ClaudePlugin extends OpenTabsPlugin {
  readonly name = 'claude';
  readonly description = 'OpenTabs plugin for Claude';
  override readonly displayName = 'Claude';
  readonly urlPatterns = ['*://claude.ai/*'];
  override readonly homepage = 'https://claude.ai';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    listOrganizations,
    listModels,
    // Conversations
    listConversations,
    getConversation,
    createConversation,
    sendMessage,
    updateConversation,
    deleteConversation,
    // Projects
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new ClaudePlugin();
