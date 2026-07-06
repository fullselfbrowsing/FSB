import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './tiktok-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { getVideo } from './tools/get-video.js';
import { getForYouFeed } from './tools/get-for-you-feed.js';
import { searchVideos } from './tools/search-videos.js';
import { searchUsers } from './tools/search-users.js';
import { getFollowing } from './tools/get-following.js';
import { getFollowers } from './tools/get-followers.js';
import { getNotifications } from './tools/get-notifications.js';

class TikTokPlugin extends OpenTabsPlugin {
  readonly name = 'tiktok';
  readonly description = 'OpenTabs plugin for TikTok';
  override readonly displayName = 'TikTok';
  readonly urlPatterns = ['*://*.tiktok.com/*'];
  override readonly homepage = 'https://www.tiktok.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getUserProfile,
    getVideo,
    getForYouFeed,
    searchVideos,
    searchUsers,
    getFollowing,
    getFollowers,
    getNotifications,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TikTokPlugin();
