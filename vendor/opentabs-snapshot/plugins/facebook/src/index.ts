import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './facebook-api.js';

import { getCurrentUser } from './tools/get-current-user.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { getUserPosts } from './tools/get-user-posts.js';
import { listNotifications } from './tools/list-notifications.js';
import { search } from './tools/search.js';
import { reactToPost } from './tools/react-to-post.js';
import { getReactions } from './tools/get-reactions.js';
import { confirmFriendRequest } from './tools/confirm-friend-request.js';
import { deleteFriendRequest } from './tools/delete-friend-request.js';
import { listFriendRequests } from './tools/list-friend-requests.js';
import { searchMarketplace } from './tools/search-marketplace.js';
import { listEvents } from './tools/list-events.js';
import { listGroups } from './tools/list-groups.js';
import { listSaved } from './tools/list-saved.js';

class FacebookPlugin extends OpenTabsPlugin {
  readonly name = 'facebook';
  readonly description = 'OpenTabs plugin for Facebook';
  override readonly displayName = 'Facebook';
  readonly urlPatterns = ['*://*.facebook.com/*'];
  override readonly homepage = 'https://www.facebook.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,

    // Users
    getUserProfile,

    // Posts
    getUserPosts,

    // Notifications
    listNotifications,

    // Search
    search,

    // Marketplace
    searchMarketplace,

    // Events
    listEvents,

    // Groups
    listGroups,

    // Saved
    listSaved,

    // Interactions
    reactToPost,
    getReactions,

    // Friends
    listFriendRequests,
    confirmFriendRequest,
    deleteFriendRequest,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new FacebookPlugin();
