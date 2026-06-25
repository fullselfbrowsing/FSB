import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './medium-api.js';
import { clapPost } from './tools/clap-post.js';
import { followTag } from './tools/follow-tag.js';
import { followUser } from './tools/follow-user.js';
import { getCollection } from './tools/get-collection.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getNotificationCount } from './tools/get-notification-count.js';
import { getPost } from './tools/get-post.js';
import { getPostResponses } from './tools/get-post-responses.js';
import { getReadingList } from './tools/get-reading-list.js';
import { getRecommendedPublishers } from './tools/get-recommended-publishers.js';
import { getTagFeed } from './tools/get-tag-feed.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { listFollowers } from './tools/list-followers.js';
import { listFollowing } from './tools/list-following.js';
import { listRecommendedTags } from './tools/list-recommended-tags.js';
import { searchCollections } from './tools/search-collections.js';
import { searchPosts } from './tools/search-posts.js';
import { searchTags } from './tools/search-tags.js';
import { unfollowTag } from './tools/unfollow-tag.js';
import { unfollowUser } from './tools/unfollow-user.js';

class MediumPlugin extends OpenTabsPlugin {
  readonly name = 'medium';
  readonly description = 'OpenTabs plugin for Medium';
  override readonly displayName = 'Medium';
  readonly urlPatterns = ['*://*.medium.com/*'];
  override readonly homepage = 'https://medium.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getNotificationCount,
    // Users
    getUserProfile,
    listFollowing,
    listFollowers,
    followUser,
    unfollowUser,
    getRecommendedPublishers,
    // Posts
    getPost,
    searchPosts,
    getTagFeed,
    getPostResponses,
    // Interactions
    clapPost,
    // Tags
    listRecommendedTags,
    searchTags,
    followTag,
    unfollowTag,
    // Collections
    getCollection,
    searchCollections,
    // Reading List
    getReadingList,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new MediumPlugin();
