import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './npm-api.js';

import { get_current_user } from './tools/get-current-user.js';
import { search_packages } from './tools/search-packages.js';
import { get_package } from './tools/get-package.js';
import { get_package_version } from './tools/get-package-version.js';
import { get_package_readme } from './tools/get-package-readme.js';
import { get_package_downloads } from './tools/get-package-downloads.js';
import { get_package_dependents } from './tools/get-package-dependents.js';
import { get_package_versions } from './tools/get-package-versions.js';
import { get_package_dependencies } from './tools/get-package-dependencies.js';
import { get_user_profile } from './tools/get-user-profile.js';
import { get_user_packages } from './tools/get-user-packages.js';
import { get_organization } from './tools/get-organization.js';
import { list_user_packages } from './tools/list-user-packages.js';
import { list_tokens } from './tools/list-tokens.js';

class NpmPlugin extends OpenTabsPlugin {
  readonly name = 'npm';
  readonly description = 'OpenTabs plugin for npm registry';
  override readonly displayName = 'npm';
  readonly urlPatterns = ['*://www.npmjs.com/*'];
  override readonly homepage = 'https://www.npmjs.com';

  readonly tools: ToolDefinition[] = [
    get_current_user,
    search_packages,
    get_package,
    get_package_version,
    get_package_readme,
    get_package_downloads,
    get_package_dependents,
    get_package_versions,
    get_package_dependencies,
    get_user_profile,
    get_user_packages,
    get_organization,
    list_user_packages,
    list_tokens,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new NpmPlugin();
