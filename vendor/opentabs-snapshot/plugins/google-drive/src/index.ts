import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './google-drive-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { listFiles } from './tools/list-files.js';
import { getFile } from './tools/get-file.js';
import { searchFiles } from './tools/search-files.js';
import { createFile } from './tools/create-file.js';
import { createFolder } from './tools/create-folder.js';
import { updateFile } from './tools/update-file.js';
import { deleteFile } from './tools/delete-file.js';
import { moveFile } from './tools/move-file.js';
import { copyFile } from './tools/copy-file.js';
import { trashFile } from './tools/trash-file.js';
import { restoreFile } from './tools/restore-file.js';
import { emptyTrash } from './tools/empty-trash.js';
import { listPermissions } from './tools/list-permissions.js';
import { createPermission } from './tools/create-permission.js';
import { deletePermission } from './tools/delete-permission.js';
import { getStorageQuota } from './tools/get-storage-quota.js';

class GoogleDrivePlugin extends OpenTabsPlugin {
  readonly name = 'google-drive';
  readonly description = 'OpenTabs plugin for Google Drive';
  override readonly displayName = 'Google Drive';
  readonly urlPatterns = ['*://drive.google.com/*'];
  override readonly homepage = 'https://drive.google.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    listFiles,
    getFile,
    searchFiles,
    createFile,
    createFolder,
    updateFile,
    deleteFile,
    moveFile,
    copyFile,
    trashFile,
    restoreFile,
    emptyTrash,
    listPermissions,
    createPermission,
    deletePermission,
    getStorageQuota,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GoogleDrivePlugin();
