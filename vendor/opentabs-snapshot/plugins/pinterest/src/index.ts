import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './pinterest-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { getNotificationCounts } from './tools/get-notification-counts.js';

// Users
import { getUserProfile } from './tools/get-user-profile.js';

// Boards
import { listBoards } from './tools/list-boards.js';
import { getBoardPins } from './tools/get-board-pins.js';
import { getBoardSections } from './tools/get-board-sections.js';
import { createBoard } from './tools/create-board.js';
import { updateBoard } from './tools/update-board.js';
import { deleteBoard } from './tools/delete-board.js';
import { createBoardSection } from './tools/create-board-section.js';
import { deleteBoardSection } from './tools/delete-board-section.js';
import { searchBoards } from './tools/search-boards.js';

// Pins
import { getPin } from './tools/get-pin.js';
import { createPin } from './tools/create-pin.js';
import { savePin } from './tools/save-pin.js';
import { deletePin } from './tools/delete-pin.js';
import { getHomeFeed } from './tools/get-home-feed.js';
import { getRelatedPins } from './tools/get-related-pins.js';
import { searchPins } from './tools/search-pins.js';
import { getUserPins } from './tools/get-user-pins.js';

// Social
import { followUser } from './tools/follow-user.js';
import { unfollowUser } from './tools/unfollow-user.js';
import { listFollowers } from './tools/list-followers.js';
import { listFollowing } from './tools/list-following.js';

class PinterestPlugin extends OpenTabsPlugin {
  readonly name = 'pinterest';
  readonly description = 'OpenTabs plugin for Pinterest';
  override readonly displayName = 'Pinterest';
  override readonly homepage = 'https://www.pinterest.com';
  readonly urlPatterns = ['*://*.pinterest.com/*'];

  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getNotificationCounts,
    // Users
    getUserProfile,
    // Boards
    listBoards,
    getBoardPins,
    getBoardSections,
    createBoard,
    updateBoard,
    deleteBoard,
    createBoardSection,
    deleteBoardSection,
    searchBoards,
    // Pins
    getPin,
    createPin,
    savePin,
    deletePin,
    getHomeFeed,
    getRelatedPins,
    searchPins,
    getUserPins,
    // Social
    followUser,
    unfollowUser,
    listFollowers,
    listFollowing,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new PinterestPlugin();
