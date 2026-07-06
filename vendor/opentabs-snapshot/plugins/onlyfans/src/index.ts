import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './onlyfans-api.js';
import { bookmarkPost } from './tools/bookmark-post.js';
import { getChatMessages } from './tools/get-chat-messages.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getFeed } from './tools/get-feed.js';
import { getListUsers } from './tools/get-list-users.js';
import { getPost } from './tools/get-post.js';
import { getRecommendations } from './tools/get-recommendations.js';
import { getUserPosts } from './tools/get-user-posts.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { likePost } from './tools/like-post.js';
import { listBookmarks } from './tools/list-bookmarks.js';
import { listChats } from './tools/list-chats.js';
import { listExpiredSubscribers } from './tools/list-expired-subscribers.js';
import { listStories } from './tools/list-stories.js';
import { listStreams } from './tools/list-streams.js';
import { listSubscribers } from './tools/list-subscribers.js';
import { listSubscriptions } from './tools/list-subscriptions.js';
import { listUserLists } from './tools/list-user-lists.js';
import { listUsers } from './tools/list-users.js';
import { searchUsers } from './tools/search-users.js';
import { sendChatMessage } from './tools/send-chat-message.js';

class OnlyFansPlugin extends OpenTabsPlugin {
  readonly name = 'onlyfans';
  readonly description = 'OpenTabs plugin for OnlyFans';
  override readonly displayName = 'OnlyFans';
  readonly urlPatterns = ['*://*.onlyfans.com/*'];
  override readonly homepage = 'https://onlyfans.com';

  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getUserProfile,
    getFeed,
    getPost,
    getUserPosts,
    likePost,
    listUsers,
    getRecommendations,
    searchUsers,
    listSubscriptions,
    listSubscribers,
    listExpiredSubscribers,
    listChats,
    getChatMessages,
    sendChatMessage,
    listUserLists,
    getListUsers,
    listBookmarks,
    bookmarkPost,
    listStories,
    listStreams,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new OnlyFansPlugin();
