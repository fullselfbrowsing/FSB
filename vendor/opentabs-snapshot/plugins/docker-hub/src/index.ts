import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './docker-hub-api.js';
import { createRepository } from './tools/create-repository.js';
import { deleteRepository } from './tools/delete-repository.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getRepository } from './tools/get-repository.js';
import { getTag } from './tools/get-tag.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { listOrganizations } from './tools/list-organizations.js';
import { listRepositories } from './tools/list-repositories.js';
import { listTags } from './tools/list-tags.js';
import { searchCatalog } from './tools/search-catalog.js';
import { searchRepositories } from './tools/search-repositories.js';
import { updateRepository } from './tools/update-repository.js';

class DockerHubPlugin extends OpenTabsPlugin {
  readonly name = 'docker-hub';
  readonly description = 'OpenTabs plugin for Docker Hub';
  override readonly displayName = 'Docker Hub';
  readonly urlPatterns = ['*://hub.docker.com/*'];
  override readonly homepage = 'https://hub.docker.com';
  readonly tools: ToolDefinition[] = [
    // Users
    getCurrentUser,
    getUserProfile,
    // Organizations
    listOrganizations,
    // Repositories
    listRepositories,
    getRepository,
    createRepository,
    updateRepository,
    deleteRepository,
    // Tags
    listTags,
    getTag,
    // Search
    searchRepositories,
    searchCatalog,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new DockerHubPlugin();
