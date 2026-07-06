import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './bluesky-api.js';
import { createPost } from './tools/create-post.js';
import { deleteMessage } from './tools/delete-message.js';
import { deletePost } from './tools/delete-post.js';
import { followUser } from './tools/follow-user.js';
import { getAuthorFeed } from './tools/get-author-feed.js';
import { getBlocks } from './tools/get-blocks.js';
import { getConversation } from './tools/get-conversation.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getFeed } from './tools/get-feed.js';
import { getFollowers } from './tools/get-followers.js';
import { getFollows } from './tools/get-follows.js';
import { getListFeed } from './tools/get-list-feed.js';
import { getMessages } from './tools/get-messages.js';
import { getPostThread } from './tools/get-post-thread.js';
import { getPosts } from './tools/get-posts.js';
import { getTimeline } from './tools/get-timeline.js';
import { getUnreadCount } from './tools/get-unread-count.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { getUserProfiles } from './tools/get-user-profiles.js';
import { likePost } from './tools/like-post.js';
import { listConversations } from './tools/list-conversations.js';
import { listNotifications } from './tools/list-notifications.js';
import { markConversationRead } from './tools/mark-conversation-read.js';
import { markNotificationsSeen } from './tools/mark-notifications-seen.js';
import { muteActor } from './tools/mute-actor.js';
import { muteConversation } from './tools/mute-conversation.js';
import { muteThread } from './tools/mute-thread.js';
import { repost } from './tools/repost.js';
import { searchPosts } from './tools/search-posts.js';
import { searchUsers } from './tools/search-users.js';
import { searchUsersTypeahead } from './tools/search-users-typeahead.js';
import { sendMessage } from './tools/send-message.js';
import { unfollowUser } from './tools/unfollow-user.js';
import { unlikePost } from './tools/unlike-post.js';
import { unmuteActor } from './tools/unmute-actor.js';
import { unmuteConversation } from './tools/unmute-conversation.js';
import { unmuteThread } from './tools/unmute-thread.js';
import { unrepost } from './tools/unrepost.js';

class BlueskyPlugin extends OpenTabsPlugin {
  readonly name = 'bluesky';
  readonly description = 'OpenTabs plugin for Bluesky';
  override readonly displayName = 'Bluesky';
  readonly urlPatterns = ['*://*.bsky.app/*'];
  override readonly homepage = 'https://bsky.app';
  readonly tools: ToolDefinition[] = [
    // Feed
    getTimeline,
    getFeed,
    getAuthorFeed,
    getPostThread,
    getPosts,
    getListFeed,
    // Posts
    createPost,
    deletePost,
    searchPosts,
    likePost,
    unlikePost,
    repost,
    unrepost,
    // Profiles
    getCurrentUser,
    getUserProfile,
    getUserProfiles,
    searchUsers,
    searchUsersTypeahead,
    // Social Graph
    getFollowers,
    getFollows,
    followUser,
    unfollowUser,
    getBlocks,
    muteActor,
    unmuteActor,
    muteThread,
    unmuteThread,
    // Notifications
    listNotifications,
    getUnreadCount,
    markNotificationsSeen,
    // Chat
    listConversations,
    getConversation,
    getMessages,
    sendMessage,
    deleteMessage,
    muteConversation,
    unmuteConversation,
    markConversationRead,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new BlueskyPlugin();
