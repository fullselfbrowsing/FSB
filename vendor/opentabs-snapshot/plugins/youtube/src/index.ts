import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './youtube-api.js';

// Search
import { searchVideos } from './tools/search-videos.js';

// Videos
import { getVideo } from './tools/get-video.js';
import { likeVideo } from './tools/like-video.js';
import { unlikeVideo } from './tools/unlike-video.js';

// Feed
import { getHomeFeed } from './tools/get-home-feed.js';
import { getSubscriptionsFeed } from './tools/get-subscriptions-feed.js';
import { getWatchHistory } from './tools/get-watch-history.js';

// Channels
import { getChannel } from './tools/get-channel.js';
import { subscribe } from './tools/subscribe.js';
import { unsubscribe } from './tools/unsubscribe.js';

// Playlists
import { listPlaylists } from './tools/list-playlists.js';
import { getPlaylist } from './tools/get-playlist.js';
import { createPlaylist } from './tools/create-playlist.js';
import { deletePlaylist } from './tools/delete-playlist.js';
import { addToPlaylist } from './tools/add-to-playlist.js';

// Comments
import { getVideoComments } from './tools/get-video-comments.js';
import { createComment } from './tools/create-comment.js';

// Notifications
import { getNotifications } from './tools/get-notifications.js';

class YouTubePlugin extends OpenTabsPlugin {
  readonly name = 'youtube';
  readonly description = 'OpenTabs plugin for YouTube';
  override readonly displayName = 'YouTube';
  readonly urlPatterns = ['*://*.youtube.com/*'];
  override readonly homepage = 'https://youtube.com';
  readonly tools: ToolDefinition[] = [
    // Search
    searchVideos,

    // Videos
    getVideo,
    likeVideo,
    unlikeVideo,

    // Feed
    getHomeFeed,
    getSubscriptionsFeed,
    getWatchHistory,

    // Channels
    getChannel,
    subscribe,
    unsubscribe,

    // Playlists
    listPlaylists,
    getPlaylist,
    createPlaylist,
    deletePlaylist,
    addToPlaylist,

    // Comments
    getVideoComments,
    createComment,

    // Notifications
    getNotifications,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new YouTubePlugin();
