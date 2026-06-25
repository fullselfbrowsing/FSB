import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './twitch-api.js';

// Users
import { getCurrentUser } from './tools/get-current-user.js';
import { getUserProfile } from './tools/get-user-profile.js';

// Streams
import { getTopStreams } from './tools/get-top-streams.js';
import { getStreamsByGame } from './tools/get-streams-by-game.js';
import { getStream } from './tools/get-stream.js';

// Games
import { getTopGames } from './tools/get-top-games.js';
import { getGame } from './tools/get-game.js';

// Search
import { searchChannels } from './tools/search-channels.js';
import { searchCategories } from './tools/search-categories.js';

// Clips
import { getUserClips } from './tools/get-user-clips.js';
import { getGameClips } from './tools/get-game-clips.js';

// Videos
import { getUserVideos } from './tools/get-user-videos.js';
import { getVideo } from './tools/get-video.js';

// Chat
import { getChannelEmotes } from './tools/get-channel-emotes.js';

class TwitchPlugin extends OpenTabsPlugin {
  readonly name = 'twitch';
  readonly description =
    'OpenTabs plugin for Twitch — browse streams, search channels and games, view clips and videos';
  override readonly displayName = 'Twitch';
  readonly urlPatterns = ['*://*.twitch.tv/*'];
  override readonly homepage = 'https://www.twitch.tv';
  readonly tools: ToolDefinition[] = [
    // Users
    getCurrentUser,
    getUserProfile,
    // Streams
    getTopStreams,
    getStreamsByGame,
    getStream,
    // Games
    getTopGames,
    getGame,
    // Search
    searchChannels,
    searchCategories,
    // Clips
    getUserClips,
    getGameClips,
    // Videos
    getUserVideos,
    getVideo,
    // Chat
    getChannelEmotes,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TwitchPlugin();
