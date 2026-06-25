import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './tumblr-api.js';

// Account tools
import { getCurrentUser } from './tools/get-current-user.js';
import { getUserLimits } from './tools/get-user-limits.js';
import { getDashboard } from './tools/get-dashboard.js';
import { getUserLikes } from './tools/get-user-likes.js';
import { getUserFollowing } from './tools/get-user-following.js';
import { followBlog } from './tools/follow-blog.js';
import { unfollowBlog } from './tools/unfollow-blog.js';
import { getFilteredTags } from './tools/get-filtered-tags.js';
import { addFilteredTag } from './tools/add-filtered-tag.js';
import { removeFilteredTag } from './tools/remove-filtered-tag.js';

// Post tools
import { getPost } from './tools/get-post.js';
import { createPost } from './tools/create-post.js';
import { editPost } from './tools/edit-post.js';
import { deletePost } from './tools/delete-post.js';
import { reblogPost } from './tools/reblog-post.js';
import { likePost } from './tools/like-post.js';
import { unlikePost } from './tools/unlike-post.js';
import { getPostNotes } from './tools/get-post-notes.js';
import { getDraftPosts } from './tools/get-draft-posts.js';
import { getQueuedPosts } from './tools/get-queued-posts.js';
import { getSubmissions } from './tools/get-submissions.js';

// Blog tools
import { getBlogInfo } from './tools/get-blog-info.js';
import { getBlogPosts } from './tools/get-blog-posts.js';
import { getBlogFollowers } from './tools/get-blog-followers.js';
import { getBlogFollowing } from './tools/get-blog-following.js';
import { getBlogLikes } from './tools/get-blog-likes.js';
import { getBlogNotifications } from './tools/get-blog-notifications.js';

// Explore tools
import { searchTagged } from './tools/search-tagged.js';
import { getRecommendedBlogs } from './tools/get-recommended-blogs.js';

// Moderation tools
import { getBlocks } from './tools/get-blocks.js';
import { blockBlog } from './tools/block-blog.js';
import { unblockBlog } from './tools/unblock-blog.js';

class TumblrPlugin extends OpenTabsPlugin {
  readonly name = 'tumblr';
  readonly description = 'OpenTabs plugin for Tumblr';
  override readonly displayName = 'Tumblr';
  readonly urlPatterns = ['*://*.tumblr.com/*'];
  override readonly homepage = 'https://www.tumblr.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getUserLimits,
    getDashboard,
    getUserLikes,
    getUserFollowing,
    followBlog,
    unfollowBlog,
    getFilteredTags,
    addFilteredTag,
    removeFilteredTag,
    getPost,
    createPost,
    editPost,
    deletePost,
    reblogPost,
    likePost,
    unlikePost,
    getPostNotes,
    getDraftPosts,
    getQueuedPosts,
    getSubmissions,
    getBlogInfo,
    getBlogPosts,
    getBlogFollowers,
    getBlogFollowing,
    getBlogLikes,
    getBlogNotifications,
    searchTagged,
    getRecommendedBlogs,
    getBlocks,
    blockBlog,
    unblockBlog,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TumblrPlugin();
