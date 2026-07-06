import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './instagram-api.js';
import { createComment } from './tools/create-comment.js';
import { followUser } from './tools/follow-user.js';
import { getConversationMessages } from './tools/get-conversation-messages.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getFollowers } from './tools/get-followers.js';
import { getFollowing } from './tools/get-following.js';
import { getFriendshipStatus } from './tools/get-friendship-status.js';
import { getHomeFeed } from './tools/get-home-feed.js';
import { getPost } from './tools/get-post.js';
import { getPostComments } from './tools/get-post-comments.js';
import { getPostLikers } from './tools/get-post-likers.js';
import { getStoriesTray } from './tools/get-stories-tray.js';
import { getSuggestedUsers } from './tools/get-suggested-users.js';
import { getUserPosts } from './tools/get-user-posts.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { getUserStories } from './tools/get-user-stories.js';
import { likePost } from './tools/like-post.js';
import { listCollections } from './tools/list-collections.js';
import { listConversations } from './tools/list-conversations.js';
import { listSavedPosts } from './tools/list-saved-posts.js';
import { savePost } from './tools/save-post.js';
import { search } from './tools/search.js';
import { searchHashtags } from './tools/search-hashtags.js';
import { searchUsers } from './tools/search-users.js';
import { sendMessage } from './tools/send-message.js';
import { unfollowUser } from './tools/unfollow-user.js';
import { unlikePost } from './tools/unlike-post.js';
import { unsavePost } from './tools/unsave-post.js';

class InstagramPlugin extends OpenTabsPlugin {
  readonly name = 'instagram';
  readonly description = 'OpenTabs plugin for Instagram';
  override readonly displayName = 'Instagram';
  readonly urlPatterns = ['*://*.instagram.com/*'];
  override readonly homepage = 'https://www.instagram.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Users
    getUserProfile,
    searchUsers,
    getUserPosts,
    getUserStories,
    // Feed
    getHomeFeed,
    getStoriesTray,
    // Posts
    getPost,
    getPostComments,
    getPostLikers,
    likePost,
    unlikePost,
    createComment,
    savePost,
    unsavePost,
    // Social
    followUser,
    unfollowUser,
    getFriendshipStatus,
    getFollowers,
    getFollowing,
    getSuggestedUsers,
    // Search
    search,
    searchHashtags,
    // Messaging
    listConversations,
    getConversationMessages,
    sendMessage,
    // Saved
    listSavedPosts,
    listCollections,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new InstagramPlugin();
