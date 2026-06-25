import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../spotify-api.js';
import { type RawPlaylistResponse, mapPlaylist, playlistSchema } from './schemas.js';

export const getPlaylist = defineTool({
  name: 'get_playlist',
  displayName: 'Get Playlist',
  description:
    'Get detailed information about a Spotify playlist including tracks, owner, and description. Provide the playlist Spotify URI (e.g., spotify:playlist:37i9dQZF1DXcBWIGoYBM5M). Tracks are included in the response.',
  summary: 'Get playlist details with tracks',
  icon: 'list-music',
  group: 'Playlists',
  input: z.object({
    uri: z.string().describe('Spotify playlist URI (e.g., "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")'),
    offset: z.number().int().min(0).optional().describe('Track offset for pagination (default 0)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum tracks to return (default 50)'),
  }),
  output: z.object({
    playlist: playlistSchema.describe('Playlist details with tracks'),
  }),
  handle: async params => {
    const data = await graphql<RawPlaylistResponse>('fetchPlaylist', {
      uri: params.uri,
      offset: params.offset ?? 0,
      limit: params.limit ?? 50,
      enableWatchFeedEntrypoint: false,
    });
    return { playlist: mapPlaylist(data) };
  },
});
