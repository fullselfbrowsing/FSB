import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './youtube-music-api.js';

// Search
import { search } from './tools/search.js';
import { get_search_suggestions } from './tools/get_search_suggestions.js';

// Browse
import { get_home } from './tools/get_home.js';
import { get_library } from './tools/get_library.js';

// Songs
import { get_song } from './tools/get_song.js';
import { like_song } from './tools/like_song.js';
import { unlike_song } from './tools/unlike_song.js';

// Artists
import { get_artist } from './tools/get_artist.js';

// Albums
import { get_album } from './tools/get_album.js';

// Playlists
import { list_playlists } from './tools/list_playlists.js';
import { get_playlist } from './tools/get_playlist.js';
import { create_playlist } from './tools/create_playlist.js';
import { delete_playlist } from './tools/delete_playlist.js';
import { add_to_playlist } from './tools/add_to_playlist.js';
import { remove_from_playlist } from './tools/remove_from_playlist.js';

class YouTubeMusicPlugin extends OpenTabsPlugin {
  readonly name = 'youtube-music';
  readonly description =
    'OpenTabs plugin for YouTube Music — search, browse, and manage your music library, playlists, liked songs, and discover new music.';
  override readonly displayName = 'YouTube Music';
  readonly urlPatterns = ['*://music.youtube.com/*'];
  override readonly excludePatterns = ['*://music.youtube.com/youtubei/*'];
  override readonly homepage = 'https://music.youtube.com';
  readonly tools: ToolDefinition[] = [
    // Search
    search,
    get_search_suggestions,

    // Browse
    get_home,
    get_library,

    // Songs
    get_song,
    like_song,
    unlike_song,

    // Artists
    get_artist,

    // Albums
    get_album,

    // Playlists
    list_playlists,
    get_playlist,
    create_playlist,
    delete_playlist,
    add_to_playlist,
    remove_from_playlist,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new YouTubeMusicPlugin();
