import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './onenote-api.js';
import { createNotebook } from './tools/create-notebook.js';
import { createPage } from './tools/create-page.js';
import { createSection } from './tools/create-section.js';
import { createSectionGroup } from './tools/create-section-group.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getNotebook } from './tools/get-notebook.js';
import { getRecentNotebooks } from './tools/get-recent-notebooks.js';
import { getSection } from './tools/get-section.js';
import { getSectionGroup } from './tools/get-section-group.js';
import { listNotebooks } from './tools/list-notebooks.js';
import { listSectionGroups } from './tools/list-section-groups.js';
import { listSections } from './tools/list-sections.js';

class OneNotePlugin extends OpenTabsPlugin {
  readonly name = 'onenote';
  readonly description = 'OpenTabs plugin for Microsoft OneNote';
  override readonly displayName = 'Microsoft OneNote';
  readonly urlPatterns = ['*://onenote.cloud.microsoft/*'];
  override readonly homepage = 'https://onenote.cloud.microsoft/';
  readonly tools: ToolDefinition[] = [
    // Notebooks
    listNotebooks,
    getNotebook,
    createNotebook,
    getRecentNotebooks,
    // Sections
    listSections,
    getSection,
    createSection,
    // Section Groups
    listSectionGroups,
    getSectionGroup,
    createSectionGroup,
    // Pages
    createPage,
    // Account
    getCurrentUser,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new OneNotePlugin();
